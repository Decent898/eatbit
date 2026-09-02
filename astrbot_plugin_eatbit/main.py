from __future__ import annotations

import base64
import io
import json
import re
import time
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Any

import aiohttp
from PIL import Image as PilImage

from astrbot.api import logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.message_components import At, Image
from astrbot.api.star import Context, Star, register


@dataclass
class Draft:
    created_at: float
    updated_at: float
    first_message_id: str
    texts: list[str] = field(default_factory=list)
    images: list[Image] = field(default_factory=list)
    preview: dict[str, Any] | None = None
    waiting_for_score: bool = False


def normalize(value: str) -> str:
    value = value.lower().replace("自助", "自选")
    return re.sub(r"[\s\-—_·()（）/\\，,。.!！:：]", "", value)


def similarity(query: str, candidate: str) -> float:
    left, right = normalize(query), normalize(candidate)
    if not left or not right:
        return 0.0
    if left in right or right in left:
        return 0.95 - abs(len(left) - len(right)) * 0.005
    return SequenceMatcher(None, left, right).ratio()


@register(
    "astrbot_plugin_eatbit",
    "DecEric",
    "EatBit QQ 群聊记餐",
    "0.3.0",
    "https://github.com/Decent898/eatbit",
)
class EatBitPlugin(Star):
    def __init__(self, context: Context, config: dict):
        super().__init__(context)
        self.api_base = str(config.get("api_base", "https://eat.bitdate.date")).rstrip("/")
        self.bot_token = str(config.get("bot_token", "")).strip()
        groups = str(config.get("allowed_group_ids", ""))
        self.allowed_groups = {item.strip() for item in groups.split(",") if item.strip()}
        self.draft_timeout = max(60, int(config.get("draft_timeout_seconds", 180)))
        self.drafts: dict[tuple[str, str], Draft] = {}
        self.catalog: dict[str, list[dict[str, Any]]] | None = None
        self.catalog_loaded_at = 0.0

    def _authorized_group(self, group_id: str) -> bool:
        return not self.allowed_groups or group_id in self.allowed_groups

    def _headers(self) -> dict[str, str]:
        return {
            "authorization": f"Bearer {self.bot_token}",
            "content-type": "application/json",
            "user-agent": "AstrBot-EatBit/0.1",
        }

    async def _post(self, path: str, payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                f"{self.api_base}{path}", headers=self._headers(), json=payload
            ) as response:
                try:
                    body = await response.json()
                except Exception:
                    body = {"error": await response.text()}
                return response.status, body

    async def _load_catalog(self) -> dict[str, list[dict[str, Any]]]:
        if self.catalog and time.time() - self.catalog_loaded_at < 60:
            return self.catalog
        timeout = aiohttp.ClientTimeout(total=20)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                f"{self.api_base}/api/catalog",
                headers={"user-agent": "AstrBot-EatBit/0.1"},
            ) as response:
                response.raise_for_status()
                self.catalog = await response.json()
                self.catalog_loaded_at = time.time()
                return self.catalog

    async def _send_private_login(
        self, event: AstrMessageEvent, binding: bool = False
    ) -> tuple[bool, str]:
        if not self.bot_token:
            return False, "机器人尚未配置 EatBit 密钥，请联系管理员。"
        status, data = await self._post(
            "/api/bot/login-ticket",
            {"qqId": event.get_sender_id(), "nickname": event.get_sender_name()},
        )
        target_url = data.get("bindUrl") if binding else data.get("url")
        if status != 200 or not target_url:
            logger.error("EatBit login ticket failed: %s %s", status, data.get("error"))
            return False, "生成登录链接失败，请稍后再试。"
        if binding:
            text = (
                "EatBit 账号绑定链接（5 分钟内有效、只能使用一次）：\n"
                f"{target_url}\n"
                "页面会显示当前 EatBit 账号；确认无误后再绑定，也可以先切换账号。"
            )
        else:
            text = (
                "EatBit 一次性登录链接（5 分钟内有效、只能使用一次）：\n"
                f"{target_url}\n"
                "打开后进入已经绑定的账号。需要换绑请发送“绑定”。"
            )
        try:
            await event.bot.send_private_msg(user_id=int(event.get_sender_id()), message=text)
            action = "绑定" if binding else "登录"
            return True, f"{action}链接已私聊发送，请查看机器人消息。"
        except Exception as error:
            logger.warning("EatBit private login message failed: %s", error)
            return False, "私聊发送失败。请先加机器人好友，再私聊发送“登录”。"

    @staticmethod
    def _contains_bot_at(event: AstrMessageEvent) -> bool:
        bot_id = str(event.message_obj.self_id)
        return any(isinstance(part, At) and str(part.qq) == bot_id for part in event.message_obj.message)

    @staticmethod
    def _image_parts(event: AstrMessageEvent) -> list[Image]:
        return [part for part in event.message_obj.message if isinstance(part, Image)]

    @staticmethod
    def _reply(event: AstrMessageEvent, text: str):
        return event.plain_result(text).stop_event()

    def _prune_drafts(self) -> None:
        cutoff = time.time() - self.draft_timeout
        self.drafts = {
            key: draft for key, draft in self.drafts.items() if draft.updated_at >= cutoff
        }

    @staticmethod
    def _best_match(
        texts: list[str], candidates: list[dict[str, Any]], minimum: float
    ) -> tuple[dict[str, Any] | None, float]:
        best: dict[str, Any] | None = None
        best_score = 0.0
        for text in texts:
            for candidate in candidates:
                score = similarity(text, str(candidate.get("name", "")))
                if score > best_score:
                    best, best_score = candidate, score
        return (best, best_score) if best_score >= minimum else (None, best_score)

    @staticmethod
    def _label_value(texts: list[str], labels: tuple[str, ...]) -> str:
        all_labels = "新店|新增店铺|区域|食堂|地点|菜品|餐品|价格|评分|打分"
        pattern = (
            rf"(?:^|\s)(?:{'|'.join(map(re.escape, labels))})\s*[:：]\s*"
            rf"(.+?)(?=\s+(?:{all_labels})\s*[:：]|$)"
        )
        for text in texts:
            match = re.search(pattern, text.strip(), re.I)
            if match:
                return match.group(1).strip()
        return ""

    async def _llm_parse(
        self,
        event: AstrMessageEvent,
        texts: list[str],
        catalog: dict[str, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        provider = self.context.get_using_provider(umo=event.unified_msg_origin)
        if not provider:
            return {}
        compact_catalog = {
            "areas": [
                {key: area.get(key) for key in ("id", "name", "campus", "kind")}
                for area in catalog.get("areas", [])
            ],
            "shops": [
                {key: shop.get(key) for key in ("id", "areaId", "name")}
                for shop in catalog.get("shops", []) if not shop.get("isClosed")
            ],
            "items": [
                {key: item.get(key) for key in ("id", "shopId", "name", "price")}
                for item in catalog.get("items", []) if not item.get("isOffShelf")
            ],
        }
        prompt = (
            "EatBit 目录：\n"
            + json.dumps(compact_catalog, ensure_ascii=False, separators=(",", ":"))
            + "\n用户依次发送的消息：\n"
            + json.dumps(texts, ensure_ascii=False)
            + "\n请提取最终表单。用户后发的纠正（如‘菜品是…’）优先。"
        )
        system_prompt = """你是校园用餐记录表单解析器。只返回一个 JSON 对象，不要 Markdown 和解释。
字段：areaName, shopName, shopId, newShop, itemName, itemId, newItem, price, score, mealSlot, review, issues。
规则：
1. area 是目录中的物理区域；shop 是具体商家、窗口或食物来源；item 是菜品。
2. 只有目录里确实存在且语义一致时才填写对应 id，否则 id 为空，并将 newShop 或 newItem 设为 true。
3. “新店：”是用户明确要求新建店铺；“区域：”不是店名的一部分。
4. “菜品是…”、“餐品：…”是菜品纠正；不要把菜品误当店名。
5. price 保留金额和单位；score 仅在用户明确给出 1-5 数字评分时填写数字，否则为 null。
6. mealSlot 只能是早餐、午餐、晚餐、夜宵、其他；没有线索则为空。
7. review 只保留对这顿饭有意义的描述，去掉“完成、确认、新店、区域、评分”等控制文字，但不要编造。
8. 中关村“教工食堂”如果出现在 area 目录中，应当作为区域理解。"""
        response = await provider.text_chat(
            prompt=prompt,
            contexts=[],
            system_prompt=system_prompt,
            temperature=0.1,
        )
        raw = str(response.completion_text or "").strip()
        match = re.search(r"\{.*\}", raw, re.S)
        if not match:
            raise ValueError("model did not return JSON")
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}

    @staticmethod
    def _infer_area(shop_name: str, areas: list[dict[str, Any]]) -> dict[str, Any] | None:
        prefix_map = (
            (("东一", "东二", "东三", "东食堂"), "east-canteen"),
            (("北一", "北二", "北三", "北食堂"), "north-canteen"),
            (("南食堂", "南一", "南二"), "south-canteen"),
            (("清真",), "halal-canteen"),
            (("学服内",), "xuefu-inside"),
            (("学服外",), "xuefu-outside"),
            (("甘棠",), "gantang-7d"),
        )
        for prefixes, area_id in prefix_map:
            if any(prefix in shop_name for prefix in prefixes):
                return next((area for area in areas if str(area.get("id")) == area_id), None)
        return None

    @staticmethod
    def _score_from_text(text: str) -> float | None:
        patterns = (
            r"(?:评分|打分|星级|评级)\s*[:：]?\s*([1-5](?:\.\d)?)\s*(?:分|星)?",
            r"([1-5](?:\.\d)?)\s*(?:分|星)",
        )
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                score = float(match.group(1))
                if 1 <= score <= 5:
                    return score
        return None

    @staticmethod
    def _meal_slot(text: str) -> str:
        for slot in ("早餐", "午餐", "晚餐", "夜宵"):
            if slot in text:
                return slot
        hour = time.localtime().tm_hour
        if hour < 5:
            return "夜宵"
        if hour < 10:
            return "早餐"
        if hour < 15:
            return "午餐"
        if hour < 21:
            return "晚餐"
        return "夜宵"

    async def _make_preview(
        self, event: AstrMessageEvent, draft: Draft
    ) -> tuple[dict[str, Any] | None, str]:
        catalog = await self._load_catalog()
        texts = [text for text in draft.texts if text]
        joined = "\n".join(texts)
        try:
            parsed = await self._llm_parse(event, texts, catalog)
        except Exception as error:
            logger.warning("EatBit model parsing failed, using rules: %s", error)
            parsed = {}
        shops = [shop for shop in catalog.get("shops", []) if not shop.get("isClosed")]
        explicit_new_shop = str(parsed.get("shopName") or self._label_value(texts, ("新店", "新增店铺"))).strip()
        force_new_shop = bool(parsed.get("newShop")) or bool(self._label_value(texts, ("新店", "新增店铺")))
        model_shop_id = str(parsed.get("shopId") or "")
        shop = next((entry for entry in shops if str(entry.get("id")) == model_shop_id), None)
        shop_score = 0.0
        if not shop and not force_new_shop:
            shop, shop_score = self._best_match(
                [str(parsed.get("shopName") or ""), *texts], shops, 0.53
            )
        area = None
        if not shop:
            if not explicit_new_shop:
                return None, (
                    f"没有可靠匹配到现有店铺（最高相似度 {shop_score:.0%}）。"
                    "如果要新增，请补充“新店：店名”和“区域：东食堂”，再发送“完成”。"
                )
            areas = list(catalog.get("areas", []))
            area_query = str(parsed.get("areaName") or self._label_value(texts, ("区域", "食堂", "地点"))).strip()
            if area_query:
                area, _ = self._best_match([area_query], areas, 0.48)
            if not area:
                area = self._infer_area(explicit_new_shop, areas)
            if not area:
                return None, "新店名已收到，但无法判断所属区域。请补充例如“区域：东食堂”，再发送“完成”。"

        items = [] if not shop else [
            item for item in catalog.get("items", [])
            if str(item.get("shopId")) == str(shop.get("id")) and not item.get("isOffShelf")
        ]
        item_correction = next((
            match.group(1).strip()
            for text in reversed(texts)
            if (match := re.match(r"^(?:菜品|餐品)\s*是\s*(.+)$", text.strip()))
        ), "")
        model_item_name = str(parsed.get("itemName") or item_correction or self._label_value(texts, ("菜品", "餐品"))).strip()
        model_item_id = str(parsed.get("itemId") or "")
        item = next((entry for entry in items if str(entry.get("id")) == model_item_id), None)
        if not item and items and not bool(parsed.get("newItem")):
            item, _ = self._best_match([model_item_name, *texts], items, 0.50)
        new_item_name = model_item_name if not item else ""
        parsed_score = parsed.get("score")
        score = float(parsed_score) if isinstance(parsed_score, (int, float)) and 1 <= float(parsed_score) <= 5 else self._score_from_text(joined)
        price_match = re.search(r"(?<!\d)(\d+(?:\.\d+)?)\s*(?:r|元|块)(?!\w)", joined, re.I)
        price = str(parsed.get("price") or (price_match.group(1) if price_match else "未识别")).strip()
        parsed_slot = str(parsed.get("mealSlot") or "")
        meal_slot = parsed_slot if parsed_slot in {"早餐", "午餐", "晚餐", "夜宵", "其他"} else self._meal_slot(joined)
        review = str(parsed.get("review") or joined).strip()
        issues = [str(issue).strip() for issue in parsed.get("issues", []) if str(issue).strip()] if isinstance(parsed.get("issues"), list) else []
        if not new_item_name and not item:
            issues.append("没有识别到菜品，可以用人话回复“菜品改成……”")
        if price == "未识别":
            issues.append("没有识别到价格；不影响提交，也可以补充价格")
        preview = {
            "parsedByModel": bool(parsed),
            "shopId": str(shop["id"]) if shop else "",
            "shopName": str(shop["name"]) if shop else explicit_new_shop,
            "isNewShop": not bool(shop),
            "areaId": str(area["id"]) if area else "",
            "areaName": str(area["name"]) if area else "",
            "itemId": str(item["id"]) if item else "",
            "itemName": str(item["name"]) if item else (new_item_name or "未填写"),
            "isNewItem": bool(new_item_name),
            "score": score,
            "price": price,
            "mealSlot": meal_slot,
            "text": review,
            "hasImage": bool(draft.images),
            "issues": list(dict.fromkeys(issues)),
        }
        draft.preview = preview
        draft.waiting_for_score = score is None
        lines = [
            "准备添加 EatBit 用餐记录：",
            f"解析：{'DeepSeek 智能整理＋目录校验' if preview['parsedByModel'] else '规则降级解析＋目录校验'}",
            f"店铺：{'【将新建】' if preview['isNewShop'] else ''}{preview['shopName']}",
            *([f"区域：{preview['areaName']}"] if preview["isNewShop"] else []),
            f"菜品：{'【将新建】' if preview['isNewItem'] else ''}{preview['itemName']}",
            f"价格：{price}" if price != "未识别" else "价格：未识别",
            f"餐次：{preview['mealSlot']}",
            f"图片：{'1 张' if preview['hasImage'] else '无'}",
            f"评价：{review}",
        ]
        if preview["issues"]:
            lines.append("AI 建议补充或核对：" + "；".join(preview["issues"]))
        if score is None:
            lines.append("还差数字评分，请回复“评分5”（支持 1～5 分）。")
        else:
            lines.extend((f"评分：{score:g}/5", "回复“确认”写入，或回复“取消”。"))
        return preview, "\n".join(lines)

    @staticmethod
    async def _compressed_data_url(image: Image) -> str:
        path = await image.convert_to_file_path()
        with PilImage.open(path) as source:
            picture = source.convert("RGB")
            picture.thumbnail((1280, 1280), PilImage.Resampling.LANCZOS)
            for quality in (78, 68, 58, 48, 40):
                output = io.BytesIO()
                picture.save(output, format="JPEG", quality=quality, optimize=True)
                raw = output.getvalue()
                if len(raw) <= 100_000 or quality == 40:
                    while len(raw) > 100_000 and picture.width > 480:
                        picture.thumbnail(
                            (int(picture.width * 0.82), int(picture.height * 0.82)),
                            PilImage.Resampling.LANCZOS,
                        )
                        output = io.BytesIO()
                        picture.save(output, format="JPEG", quality=40, optimize=True)
                        raw = output.getvalue()
                    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")
        return ""

    async def _submit(self, event: AstrMessageEvent, draft: Draft) -> tuple[bool, str]:
        assert draft.preview is not None
        image = ""
        if draft.images:
            image = await self._compressed_data_url(draft.images[0])
        preview = draft.preview
        status, data = await self._post(
            "/api/bot/meal-record",
            {
                "qqId": event.get_sender_id(),
                "messageId": (
                    f"{event.get_group_id() or 'private'}:{event.get_sender_id()}:"
                    f"{draft.first_message_id}:{int(draft.created_at)}"
                ),
                "shopId": preview["shopId"],
                "newShop": ({
                    "name": preview["shopName"],
                    "areaId": preview["areaId"],
                } if preview["isNewShop"] else None),
                "itemId": preview["itemId"] or None,
                "newItem": ({
                    "name": preview["itemName"],
                    "price": preview["price"] if preview["price"] != "未识别" else "",
                } if preview["isNewItem"] else None),
                "score": preview["score"],
                "text": preview["text"],
                "image": image,
                "mealSlot": preview["mealSlot"],
                "isAnonymous": False,
            },
        )
        if status in (200, 201):
            if data.get("createdShop") or data.get("createdItem"):
                self.catalog = None
            suffix = "（已自动去重）" if data.get("duplicate") else ""
            created = "，并已新增店铺" if data.get("createdShop") else ""
            created_item = "、菜品" if data.get("createdShop") and data.get("createdItem") else ("，并已新增菜品" if data.get("createdItem") else "")
            return True, f"已添加到 EatBit：{preview['shopName']} · {preview['mealSlot']}{created}{created_item} {suffix}".strip()
        if data.get("error") == "qq_not_bound":
            return False, "这个 QQ 还没有登录 EatBit，请先 @机器人 发送“登录”。"
        logger.error("EatBit meal record failed: %s %s", status, data.get("error"))
        return False, f"写入失败：{data.get('error', '服务暂时不可用')}"

    @filter.event_message_type(filter.EventMessageType.ALL, priority=10)
    async def on_message(self, event: AstrMessageEvent):
        self._prune_drafts()
        sender_id = str(event.get_sender_id())
        group_id = str(event.get_group_id() or "private")
        if group_id != "private" and not self._authorized_group(group_id):
            return

        text = event.message_str.strip()
        lowered = normalize(text)
        mentioned = self._contains_bot_at(event) if group_id != "private" else True
        key = (group_id, sender_id)
        images = self._image_parts(event)

        if mentioned and lowered in {"登录", "登陆", "eatbit登录", "eatbit登陆"}:
            _, reply = await self._send_private_login(event, binding=False)
            yield self._reply(event, reply)
            return

        if mentioned and lowered in {"绑定", "重新绑定", "换绑", "eatbit绑定"}:
            _, reply = await self._send_private_login(event, binding=True)
            yield self._reply(event, reply)
            return

        draft = self.drafts.get(key)
        starts_record = mentioned and (bool(images) or any(word in text for word in ("记录", "记一顿", "吃了")))
        if not draft and starts_record:
            now = time.time()
            draft = Draft(
                created_at=now,
                updated_at=now,
                first_message_id=str(event.message_obj.message_id),
            )
            self.drafts[key] = draft
            clean = re.sub(r"(?:记录吃饭|记录|记一顿)", "", text).strip()
            if clean:
                draft.texts.append(clean)
            draft.images.extend(images[:1])
            yield self._reply(event, "开始收集这顿饭。继续发送图片和文字，最后发送“完成”。")
            return

        if not draft:
            return

        event.stop_event()
        draft.updated_at = time.time()
        if text in {"取消", "算了", "不记了"}:
            self.drafts.pop(key, None)
            yield self._reply(event, "已取消这条 EatBit 记录。")
            return

        if text == "确认" and draft.preview and not draft.waiting_for_score:
            try:
                ok, reply = await self._submit(event, draft)
            except Exception as error:
                logger.exception("EatBit submit crashed: %s", error)
                ok, reply = False, "写入失败，草稿仍保留；可以稍后再次回复“确认”。"
            if ok:
                self.drafts.pop(key, None)
            yield self._reply(event, reply)
            return

        completion = re.match(r"^(?:完成|发完了|提交)(?:\s*[:：,，;；]?\s*(.*))?$", text)
        if completion and completion.group(1):
            draft.texts.append(completion.group(1).strip())
        elif text and not completion:
            draft.texts.append(text)
        if images and not draft.images:
            draft.images.append(images[0])

        should_preview = bool(completion) or draft.preview is not None
        if should_preview:
            try:
                _, reply = await self._make_preview(event, draft)
            except Exception as error:
                logger.exception("EatBit preview failed: %s", error)
                reply = "读取 EatBit 店铺目录失败，草稿已保留，请稍后再发送“完成”。"
            yield self._reply(event, reply)
