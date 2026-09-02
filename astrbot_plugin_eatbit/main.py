from __future__ import annotations

import base64
import io
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
    "0.1.0",
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

    async def _send_private_login(self, event: AstrMessageEvent) -> tuple[bool, str]:
        if not self.bot_token:
            return False, "机器人尚未配置 EatBit 密钥，请联系管理员。"
        status, data = await self._post(
            "/api/bot/login-ticket",
            {"qqId": event.get_sender_id(), "nickname": event.get_sender_name()},
        )
        if status != 200 or not data.get("url"):
            logger.error("EatBit login ticket failed: %s %s", status, data.get("error"))
            return False, "生成登录链接失败，请稍后再试。"
        text = (
            "EatBit 一次性登录链接（5 分钟内有效、只能使用一次）：\n"
            f"{data['url']}\n"
            "打开后即可登录；以后用这个 QQ 记录会自动写入你的账号。"
        )
        try:
            await event.bot.send_private_msg(user_id=int(event.get_sender_id()), message=text)
            return True, "登录链接已私聊发送，请查看机器人消息。"
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
        pattern = rf"^(?:{'|'.join(map(re.escape, labels))})\s*[:：]\s*(.+)$"
        for text in texts:
            match = re.match(pattern, text.strip(), re.I)
            if match:
                return match.group(1).strip()
        return ""

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
        if hour < 10:
            return "早餐"
        if hour < 15:
            return "午餐"
        if hour < 21:
            return "晚餐"
        return "夜宵"

    async def _make_preview(self, draft: Draft) -> tuple[dict[str, Any] | None, str]:
        catalog = await self._load_catalog()
        texts = [text for text in draft.texts if text]
        joined = "\n".join(texts)
        shops = [shop for shop in catalog.get("shops", []) if not shop.get("isClosed")]
        explicit_new_shop = self._label_value(texts, ("新店", "新增店铺"))
        shop, shop_score = (None, 0.0) if explicit_new_shop else self._best_match(texts, shops, 0.53)
        area = None
        if not shop:
            if not explicit_new_shop:
                return None, (
                    f"没有可靠匹配到现有店铺（最高相似度 {shop_score:.0%}）。"
                    "如果要新增，请补充“新店：店名”和“区域：东食堂”，再发送“完成”。"
                )
            areas = list(catalog.get("areas", []))
            area_query = self._label_value(texts, ("区域", "食堂", "地点"))
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
        item, _ = self._best_match(texts, items, 0.50) if items else (None, 0.0)
        score = self._score_from_text(joined)
        price_match = re.search(r"(?<!\d)(\d+(?:\.\d+)?)\s*(?:r|元|块)(?!\w)", joined, re.I)
        price = price_match.group(1) if price_match else "未识别"
        preview = {
            "shopId": str(shop["id"]) if shop else "",
            "shopName": str(shop["name"]) if shop else explicit_new_shop,
            "isNewShop": not bool(shop),
            "areaId": str(area["id"]) if area else "",
            "areaName": str(area["name"]) if area else "",
            "itemId": str(item["id"]) if item else "",
            "itemName": str(item["name"]) if item else "未匹配（仍可记到店铺）",
            "score": score,
            "price": price,
            "mealSlot": self._meal_slot(joined),
            "text": joined,
            "hasImage": bool(draft.images),
        }
        draft.preview = preview
        draft.waiting_for_score = score is None
        lines = [
            "准备添加 EatBit 用餐记录：",
            f"店铺：{'【将新建】' if preview['isNewShop'] else ''}{preview['shopName']}",
            *([f"区域：{preview['areaName']}"] if preview["isNewShop"] else []),
            f"菜品：{preview['itemName']}",
            f"价格：{price} 元" if price != "未识别" else "价格：未识别（会保留原文）",
            f"餐次：{preview['mealSlot']}",
            f"图片：{'1 张' if preview['hasImage'] else '无'}",
            f"内容：{joined}",
        ]
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
                "score": preview["score"],
                "text": preview["text"],
                "image": image,
                "mealSlot": preview["mealSlot"],
                "isAnonymous": False,
            },
        )
        if status in (200, 201):
            if data.get("createdShop"):
                self.catalog = None
            suffix = "（已自动去重）" if data.get("duplicate") else ""
            created = "，并已新增店铺" if data.get("createdShop") else ""
            return True, f"已添加到 EatBit：{preview['shopName']} · {preview['mealSlot']}{created} {suffix}".strip()
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
            _, reply = await self._send_private_login(event)
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

        if text and text not in {"完成", "发完了", "提交"}:
            draft.texts.append(text)
        if images and not draft.images:
            draft.images.append(images[0])

        should_preview = text in {"完成", "发完了", "提交"}
        if draft.waiting_for_score and self._score_from_text(text) is not None:
            should_preview = True
        if should_preview:
            try:
                _, reply = await self._make_preview(draft)
            except Exception as error:
                logger.exception("EatBit preview failed: %s", error)
                reply = "读取 EatBit 店铺目录失败，草稿已保留，请稍后再发送“完成”。"
            yield self._reply(event, reply)
