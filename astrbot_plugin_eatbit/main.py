from __future__ import annotations

import base64
import asyncio
import io
import json
import re
import shutil
import time
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
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
    images: list[str] = field(default_factory=list)
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
    "0.5.9",
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
        self.parser_provider_id = str(config.get("parser_provider_id", "eatbit_parser")).strip()
        self.parser_timeout = max(3, min(30, int(config.get("parser_timeout_seconds", 12))))
        self.vision_provider_id = str(config.get("vision_provider_id", "vision")).strip()
        self.vision_timeout = max(5, min(60, int(config.get("vision_timeout_seconds", 20))))
        self.drafts: dict[tuple[str, str], Draft] = {}
        self.draft_image_dir = (
            Path(__file__).resolve().parents[2]
            / "plugin_data"
            / "astrbot_plugin_eatbit"
            / "draft_images"
        )
        self.draft_image_dir.mkdir(parents=True, exist_ok=True)
        self.catalog: dict[str, list[dict[str, Any]]] | None = None
        self.catalog_loaded_at = 0.0

    @staticmethod
    def _qwen_compatible_messages(messages: list[Any]) -> list[dict[str, Any]]:
        compatible: list[dict[str, Any]] = []
        for original in messages:
            if not isinstance(original, dict) or not original.get("role"):
                continue
            message = dict(original)
            content = message.get("content", "")
            if isinstance(content, list):
                text_parts: list[str] = []
                image_count = 0
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        if part.get("text"):
                            text_parts.append(str(part["text"]))
                    elif isinstance(part, dict) and part.get("type") == "image_url":
                        image_count += 1
                    elif isinstance(part, str):
                        text_parts.append(part)
                if image_count:
                    text_parts.append(f"[图片 {image_count} 张，已由视觉模型处理]")
                content = "\n".join(text_parts)
            elif content is None:
                content = ""
            elif not isinstance(content, str):
                content = json.dumps(content, ensure_ascii=False)
            message["content"] = content
            compatible.append(message)
        return compatible

    def _ensure_qwen_provider_compatibility(self, provider: Any) -> None:
        if getattr(provider, "_eatbit_qwen_compat", False):
            return
        original_prepare = provider._prepare_chat_payload

        async def compatible_prepare(*args: Any, **kwargs: Any):
            payload, context_query = await original_prepare(*args, **kwargs)
            messages = self._qwen_compatible_messages(payload.get("messages", []))
            payload["messages"] = messages
            return payload, messages

        provider._prepare_chat_payload = compatible_prepare
        provider._eatbit_qwen_compat = True

    @filter.on_llm_request()
    async def normalize_qwen_requests(self, event: AstrMessageEvent, request: Any) -> None:
        provider = self.context.get_using_provider(umo=event.unified_msg_origin)
        if not provider:
            return
        model = str(provider.get_model() or "")
        if model != "@cf/qwen/qwen3-30b-a3b-fp8":
            return
        request.contexts = self._qwen_compatible_messages(request.contexts or [])
        self._ensure_qwen_provider_compatibility(provider)

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

    async def _login_link_reply(
        self,
        event: AstrMessageEvent,
        binding: bool = False,
        ticket_data: dict[str, Any] | None = None,
    ) -> tuple[bool, str]:
        if not self.bot_token:
            return False, "机器人尚未配置 EatBit 密钥，请联系管理员。"
        if ticket_data is None:
            status, data = await self._post(
                "/api/bot/login-ticket",
                {"qqId": event.get_sender_id(), "nickname": event.get_sender_name()},
            )
        else:
            status, data = 200, ticket_data
        binding = binding or not bool(data.get("bound"))
        target_url = data.get("bindUrl") if binding else data.get("url")
        if status != 200 or not target_url:
            logger.error("EatBit login ticket failed: %s %s", status, data.get("error"))
            return False, "生成登录链接失败，请稍后再试。"
        if binding:
            text = (
                "当前 QQ 尚未绑定 EatBit。\n"
                "登录/绑定用于确认记录归属，并把群聊记餐同步到你的个人记录。\n"
                "这里使用的是“吃在北理”网页和小程序共用的同一个 EatBit 账号，账号与数据互通。\n"
                "请仅由记录发起者打开下面的绑定链接，不要转发（5 分钟内有效、只能使用一次）：\n"
                f"{target_url}\n"
                "可以登录已有账号；没有账号时，填写新邮箱和昵称会自动注册并绑定。"
            )
        else:
            text = (
                "EatBit 一次性登录链接（5 分钟内有效、只能使用一次）：\n"
                f"{target_url}\n"
                "打开后进入已经绑定的账号。需要换绑请发送“绑定”。"
            )
        return True, text

    async def _describe_images(
        self, event: AstrMessageEvent, images: list[Image], prompt: str
    ) -> str:
        provider = self.context.get_provider_by_id(self.vision_provider_id)
        if not provider:
            return "识图模型尚未就绪，请稍后再试。"
        try:
            provider_config = provider.provider_config
            api_base = str(provider_config.get("api_base", ""))
            if "/ai/v1" not in api_base:
                raise ValueError("vision provider is not a Workers AI provider")
            keys = provider.get_keys()
            api_key = str(keys[0] if isinstance(keys, list) else keys)
            model = str(provider.get_model() or provider_config.get("model", "")).strip()
            if not model:
                raise ValueError(
                    f"vision provider {self.vision_provider_id!r} has no configured model"
                )
            image_variants = [
                await self._compressed_data_url(images[0]),
                await self._compressed_data_url(images[0], max_side=768, max_bytes=60_000),
            ]
            vision_prompt = (
                "你是群聊中的视觉助手。请准确识别图片，用简洁自然的中文回答；"
                "看不清或无法确定的内容要明确说明，不要编造。\n\n"
                + (prompt or "请描述图片内容，并回答图片相关问题。")
            )
            timeout = aiohttp.ClientTimeout(total=self.vision_timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                last_error = ""
                for attempt, image_data in enumerate(image_variants, start=1):
                    async with session.post(
                        api_base.split("/ai/v1", 1)[0] + "/ai/run/" + model,
                        headers={
                            "authorization": f"Bearer {api_key}",
                            "content-type": "application/json",
                        },
                        json={
                            "prompt": vision_prompt,
                            "image": image_data,
                            "temperature": 0.2,
                            "max_tokens": 500,
                        },
                    ) as response:
                        body = await response.json()
                        if response.status == 200 and body.get("success"):
                            break
                        last_error = (
                            f"HTTP {response.status}: "
                            f"{body.get('errors') or body.get('messages') or body}"
                        )
                        logger.warning(
                            "Workers AI vision attempt %s failed (model=%s, image_chars=%s): %s",
                            attempt,
                            model,
                            len(image_data),
                            last_error,
                        )
                else:
                    raise RuntimeError(f"Workers AI returned {last_error}")
            answer = str(body.get("result", {}).get("response") or "").strip()
        except (asyncio.TimeoutError, aiohttp.ServerTimeoutError):
            logger.warning(
                "Vision model timed out after %ss (provider=%s)",
                self.vision_timeout,
                self.vision_provider_id,
            )
            return "这次识图超时了，请稍后重试。"
        except Exception as error:
            logger.warning("Vision model request failed: %s", error)
            return "图片识别失败，请稍后重试。"
        return answer or "没有从图片中识别出可靠内容。"

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
        for key, draft in list(self.drafts.items()):
            if draft.updated_at < cutoff:
                self._delete_draft_images(draft)
                self.drafts.pop(key, None)

    def _delete_draft_images(self, draft: Draft) -> None:
        for image_path in draft.images:
            try:
                Path(image_path).unlink(missing_ok=True)
            except OSError as error:
                logger.warning("Unable to delete EatBit draft image %s: %s", image_path, error)

    async def _persist_draft_image(self, image: Image) -> str:
        source_path = Path(await image.convert_to_file_path())
        suffix = source_path.suffix.lower()
        if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}:
            suffix = ".img"
        target_path = self.draft_image_dir / f"{time.time_ns()}_{source_path.stem[-12:]}{suffix}"
        await asyncio.to_thread(shutil.copy2, source_path, target_path)
        return str(target_path)

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

    @staticmethod
    def _explicit_shop_name(texts: list[str]) -> str:
        """Return the user's latest explicit shop correction, if present."""
        next_field = "区域|食堂|地点|菜品|餐品|价格|评分|打分"
        pattern = re.compile(
            rf"(?:^|[\s，,；;])(?:修改\s*[:：]\s*)?"
            rf"(?:店铺|店名|商家|窗口)\s*(?:是|叫|为|[:：])\s*"
            rf"(.+?)(?=[\s，,；;]+(?:{next_field})(?:\s*(?:是|叫|为|[:：]))?|$)",
            re.I,
        )
        for text in reversed(texts):
            matches = list(pattern.finditer(text.strip()))
            if matches:
                return matches[-1].group(1).strip(" \t，,；;")
        return ""

    async def _llm_parse(
        self,
        event: AstrMessageEvent,
        texts: list[str],
        catalog: dict[str, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        provider = (
            self.context.get_provider_by_id(self.parser_provider_id)
            if self.parser_provider_id
            else None
        )
        if not provider:
            provider = self.context.get_using_provider(umo=event.unified_msg_origin)
        if not provider:
            return {}
        def relevance(entry: dict[str, Any]) -> float:
            name = str(entry.get("name", ""))
            return max((similarity(text, name) for text in texts), default=0.0)

        active_shops = [
            shop for shop in catalog.get("shops", []) if not shop.get("isClosed")
        ]
        active_items = [
            item for item in catalog.get("items", []) if not item.get("isOffShelf")
        ]
        likely_shops = sorted(active_shops, key=relevance, reverse=True)[:15]
        likely_items = sorted(active_items, key=relevance, reverse=True)[:20]
        compact_catalog = {
            "areas": [
                {key: area.get(key) for key in ("id", "name", "campus", "kind")}
                for area in catalog.get("areas", [])
            ],
            "shops": [
                {key: shop.get(key) for key in ("id", "areaId", "name")}
                for shop in likely_shops
            ],
            "items": [
                {key: item.get(key) for key in ("id", "shopId", "name", "price")}
                for item in likely_items
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
4. 用户最后明确说“店铺是…”、“店铺：…”或“修改：店铺：…”时必须覆盖之前的店铺判断；目录没有精确同名店铺就按新店处理，不得用相似店铺替代。
5. “菜品是…”、“餐品：…”是菜品纠正；不要把菜品误当店名。
6. price 保留金额和单位；score 仅在用户明确给出 1-5 数字评分时填写数字，否则为 null。
7. mealSlot 只能是早餐、午餐、晚餐、夜宵、其他；没有线索则为空。
8. review 只保留对这顿饭有意义的描述，去掉“完成、确认、新店、区域、评分”等控制文字，但不要编造。
9. 中关村“教工食堂”如果出现在 area 目录中，应当作为区域理解。"""
        response = await asyncio.wait_for(
            provider.text_chat(
                prompt=prompt,
                contexts=[],
                system_prompt=system_prompt,
                temperature=0.1,
                max_tokens=700,
            ),
            timeout=self.parser_timeout,
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

    @staticmethod
    def _rule_item_name(texts: list[str], area_name: str) -> str:
        """Best-effort fallback used only when the dedicated parser is unavailable."""
        for text in texts:
            match = re.search(
                r"([\u4e00-\u9fffA-Za-z][\u4e00-\u9fffA-Za-z0-9]{0,15})"
                r"\s*\d+(?:\.\d+)?\s*(?:r|元|块)",
                text,
                re.I,
            )
            if not match:
                continue
            name = match.group(1)
            if area_name:
                name = name.replace(area_name, "")
            name = re.sub(r"^(?:中关村)?(?:一|二|三|四|五|六|七|八|九|十|\d+)楼", "", name)
            name = re.sub(r"^(?:吃了|点了|买了|来份|来一份)", "", name)
            if name:
                return name
        return ""

    @staticmethod
    def _render_preview(preview: dict[str, Any]) -> str:
        shop_label = preview["shopName"] or "待确认"
        item_label = preview["itemName"] or "未填写"
        lines = [
            "AI 已整理这顿饭：",
            f"店铺：{'【将新建】' if preview['isNewShop'] else ''}{shop_label}",
            f"区域：{preview['areaName'] or '待确认'}",
            f"菜品：{'【将新建】' if preview['isNewItem'] else ''}{item_label}",
            f"价格：{preview['price']}",
            f"餐次：{preview['mealSlot']}",
            f"图片：{'1 张' if preview['hasImage'] else '无'}",
            f"评价：{preview['text'] or '未填写'}",
            f"评分：{preview['score']:g}/5" if preview["score"] is not None else "评分：待补充",
        ]
        if preview["blockingIssues"]:
            lines.append("还需要你补充或确认：" + "；".join(preview["blockingIssues"]))
            lines.append("直接用一句话告诉我即可，例如：“店铺叫自选菜，评分4”。")
        else:
            if preview["issues"]:
                lines.append("请顺便核对：" + "；".join(preview["issues"]))
            lines.append("回复“确认”提交；要修改也直接用人话说。")
        return "\n".join(lines)

    async def _make_preview(
        self, event: AstrMessageEvent, draft: Draft
    ) -> tuple[dict[str, Any] | None, str]:
        catalog = await self._load_catalog()
        texts = [text for text in draft.texts if text]
        joined = "\n".join(texts)
        try:
            parsed = await self._llm_parse(event, texts, catalog)
        except asyncio.TimeoutError:
            logger.warning(
                "EatBit parser timed out after %ss (provider=%s), using rules",
                self.parser_timeout,
                self.parser_provider_id,
            )
            parsed = {}
        except Exception as error:
            logger.warning("EatBit model parsing failed, using rules: %s", error)
            parsed = {}
        areas = list(catalog.get("areas", []))
        parsed_shop_name = str(parsed.get("shopName") or "").strip()
        mistaken_area = next(
            (
                entry
                for entry in areas
                if normalize(str(entry.get("name", ""))) == normalize(parsed_shop_name)
            ),
            None,
        )
        if mistaken_area:
            parsed["areaName"] = str(mistaken_area.get("name", ""))
            parsed["shopName"] = ""
            parsed["shopId"] = ""
            parsed["newShop"] = False

        shops = [shop for shop in catalog.get("shops", []) if not shop.get("isClosed")]
        labelled_new_shop = self._label_value(texts, ("新店", "新增店铺"))
        explicit_shop_name = self._explicit_shop_name(texts)
        proposed_shop_name = str(
            explicit_shop_name or parsed.get("shopName") or labelled_new_shop
        ).strip()
        force_new_shop = bool(parsed.get("newShop")) or bool(labelled_new_shop)
        model_shop_id = "" if explicit_shop_name else str(parsed.get("shopId") or "")
        shop = next((entry for entry in shops if str(entry.get("id")) == model_shop_id), None)
        if explicit_shop_name:
            shop = next(
                (
                    entry
                    for entry in shops
                    if normalize(str(entry.get("name", ""))) == normalize(explicit_shop_name)
                ),
                None,
            )
            force_new_shop = shop is None
        if not shop and not force_new_shop:
            shop, _ = self._best_match(
                [str(parsed.get("shopName") or ""), *texts], shops, 0.53
            )
        area = None
        if not shop:
            area_query = str(parsed.get("areaName") or self._label_value(texts, ("区域", "食堂", "地点"))).strip()
            if area_query:
                area, _ = self._best_match([area_query], areas, 0.48)
            if not area:
                area, _ = self._best_match(texts, areas, 0.48)
            if not area and proposed_shop_name:
                area = self._infer_area(proposed_shop_name, areas)
        elif shop:
            area = next(
                (entry for entry in areas if str(entry.get("id")) == str(shop.get("areaId"))),
                None,
            )

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
        if not model_item_name and not parsed:
            model_item_name = self._rule_item_name(texts, str(area.get("name", "")) if area else "")
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
        blocking_issues = []
        if not shop and not proposed_shop_name:
            blocking_issues.append("店铺或窗口名不确定")
        if not shop and proposed_shop_name and not area:
            blocking_issues.append("新店所属区域不确定")
        if not new_item_name and not item:
            issues.append("菜品没有识别到")
        if price == "未识别":
            issues.append("价格没有识别到（不影响提交）")
        if score is None:
            blocking_issues.append("缺少 1～5 分评分")
        preview = {
            "parsedByModel": bool(parsed),
            "shopId": str(shop["id"]) if shop else "",
            "shopName": str(shop["name"]) if shop else proposed_shop_name,
            "isNewShop": not bool(shop) and bool(proposed_shop_name),
            "areaId": str(area["id"]) if area else "",
            "areaName": str(area["name"]) if area else "",
            "itemId": str(item["id"]) if item else "",
            "itemName": str(item["name"]) if item else new_item_name,
            "isNewItem": bool(new_item_name),
            "score": score,
            "price": price,
            "mealSlot": meal_slot,
            "text": review,
            "hasImage": bool(draft.images),
            "issues": list(dict.fromkeys(issues)),
            "blockingIssues": list(dict.fromkeys(blocking_issues)),
        }
        draft.preview = preview
        draft.waiting_for_score = score is None
        return preview, self._render_preview(preview)

    @staticmethod
    async def _compressed_data_url(
        image: Image | str, max_side: int = 1280, max_bytes: int = 100_000
    ) -> str:
        path = await image.convert_to_file_path() if isinstance(image, Image) else image
        with PilImage.open(path) as source:
            picture = source.convert("RGB")
            picture.thumbnail((max_side, max_side), PilImage.Resampling.LANCZOS)
            for quality in (78, 68, 58, 48, 40):
                output = io.BytesIO()
                picture.save(output, format="JPEG", quality=quality, optimize=True)
                raw = output.getvalue()
                if len(raw) <= max_bytes or quality == 40:
                    while len(raw) > max_bytes and picture.width > 480:
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
            _, reply = await self._login_link_reply(event, binding=False)
            yield self._reply(event, reply)
            return

        if mentioned and lowered in {"绑定", "重新绑定", "换绑", "eatbit绑定"}:
            _, reply = await self._login_link_reply(event, binding=True)
            yield self._reply(event, reply)
            return

        draft = self.drafts.get(key)
        record_command = re.match(
            r"^(?:记录吃饭|开始记录|记一顿|记录)(?=$|[\s：:，,])",
            text,
        )
        if mentioned and images and not draft and not record_command:
            event.stop_event()
            reply = await self._describe_images(event, images, text)
            yield self._reply(event, reply)
            return

        starts_record = mentioned and bool(record_command)
        if not draft and starts_record:
            status, ticket_data = await self._post(
                "/api/bot/login-ticket",
                {"qqId": event.get_sender_id(), "nickname": event.get_sender_name()},
            )
            if status != 200:
                logger.error(
                    "EatBit binding check failed: %s %s",
                    status,
                    ticket_data.get("error"),
                )
                yield self._reply(event, "暂时无法检查 EatBit 账号绑定状态，请稍后重试。")
                return
            if not ticket_data.get("bound"):
                _, reply = await self._login_link_reply(
                    event, binding=True, ticket_data=ticket_data
                )
                yield self._reply(
                    event,
                    reply + "\n绑定完成后，请重新发送“记录吃饭”。",
                )
                return
            now = time.time()
            draft = Draft(
                created_at=now,
                updated_at=now,
                first_message_id=str(event.message_obj.message_id),
            )
            self.drafts[key] = draft
            clean = text[record_command.end():].lstrip(" \t：:，,")
            if clean:
                draft.texts.append(clean)
            if images:
                try:
                    draft.images.append(await self._persist_draft_image(images[0]))
                except Exception as error:
                    logger.exception("Unable to preserve EatBit draft image: %s", error)
                    self.drafts.pop(key, None)
                    yield self._reply(event, "图片暂存失败，请重新发送“记录吃饭”和图片。")
                    return
            yield self._reply(event, "开始收集这顿饭。继续发送图片和文字，最后发送“完成”。")
            return

        if not draft:
            return

        event.stop_event()
        draft.updated_at = time.time()
        if text in {"取消", "算了", "不记了"}:
            self._delete_draft_images(draft)
            self.drafts.pop(key, None)
            yield self._reply(event, "已取消这条 EatBit 记录。")
            return

        if text == "确认" and draft.preview and not draft.preview.get("blockingIssues"):
            try:
                ok, reply = await self._submit(event, draft)
            except Exception as error:
                logger.exception("EatBit submit crashed: %s", error)
                ok, reply = False, "写入失败，草稿仍保留；可以稍后再次回复“确认”。"
            if ok:
                self._delete_draft_images(draft)
                self.drafts.pop(key, None)
            yield self._reply(event, reply)
            return

        if text == "确认" and draft.preview:
            yield self._reply(
                event,
                "还不能提交：" + "；".join(draft.preview.get("blockingIssues", []))
                + "。直接用一句话补充或修改即可。",
            )
            return

        completion = re.match(r"^(?:完成|发完了|提交)(?:\s*[:：,，;；]?\s*(.*))?$", text)
        if completion and completion.group(1):
            draft.texts.append(completion.group(1).strip())
        elif text and not completion:
            draft.texts.append(text)
        if images and not draft.images:
            try:
                draft.images.append(await self._persist_draft_image(images[0]))
            except Exception as error:
                logger.exception("Unable to preserve EatBit draft image: %s", error)
                yield self._reply(event, "图片暂存失败，请重新发送这张图片。")
                return

        should_preview = bool(completion) or draft.preview is not None
        if should_preview:
            try:
                _, reply = await self._make_preview(event, draft)
            except Exception as error:
                logger.exception("EatBit preview failed: %s", error)
                reply = "读取 EatBit 店铺目录失败，草稿已保留，请稍后再发送“完成”。"
            yield self._reply(event, reply)
