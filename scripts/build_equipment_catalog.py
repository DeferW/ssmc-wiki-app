from __future__ import annotations

import argparse
import copy
import json
import re
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import yaml
from PIL import Image


class GameYamlLoader(yaml.SafeLoader):
    """YAML loader that preserves SS14 custom tags as plain JSON values."""


def construct_tagged_value(
    loader: GameYamlLoader,
    tag_suffix: str,
    node: yaml.Node,
) -> Any:
    if isinstance(node, yaml.MappingNode):
        value = loader.construct_mapping(node, deep=True)
    elif isinstance(node, yaml.SequenceNode):
        value = loader.construct_sequence(node, deep=True)
    else:
        value = loader.construct_scalar(node)
    return {"yamlTag": f"!{tag_suffix}", "value": value}


GameYamlLoader.add_multi_constructor("!", construct_tagged_value)


FTL_MESSAGE_RE = re.compile(r"^([A-Za-z0-9][A-Za-z0-9_-]*)\s*=\s*(.*)$")
FTL_ATTRIBUTE_RE = re.compile(r"^\s+\.([A-Za-z0-9_-]+)\s*=\s*(.*)$")
FTL_REFERENCE_RE = re.compile(r"^\{\s*([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?\s*\}$")


ROOT_RELATION_TYPES = {
    "contains",
    "slotItem",
    "loadedWith",
    "installedAttachment",
    "bundleItem",
    "variant",
    "fires",
    "refillableBy",
}


HIERARCHICAL_RELATION_TYPES = ROOT_RELATION_TYPES - {"refillableBy"}


CASE_CONTENT_RELATION_TYPES = {"contains", "bundleItem", "variant"}


PUBLIC_CATEGORY_LABELS = {
    "weapon": "Оружие",
    "attachment": "Обвесы",
    "explosive": "Взрывчатка",
    "magazine-or-ammo-container": "Боеприпасы",
    "cartridge": "Боеприпасы",
    "armor": "Броня",
    "melee": "Ближний бой",
    "container": "Снаряжение",
    "misc": "Прочее",
}


CORE_COMPONENTS = {
    "Armor",
    "BallisticAmmoProvider",
    "CartridgeAmmo",
    "CMArmorPiercing",
    "CMItemSlots",
    "ContainerFill",
    "Damageable",
    "Gun",
    "GunDamageModifier",
    "Item",
    "ItemSlots",
    "MeleeWeapon",
    "Projectile",
    "RMCArmor",
    "RMCArmorVariant",
    "RMCFlamerAmmoProvider",
    "RMCFlamerTank",
    "RMCProjectileAccuracy",
    "RMCProjectileDamageFalloff",
    "RMCSelectiveFire",
    "RMCWeaponAccuracy",
    "RMCWeaponDamageFalloff",
    "SolutionContainerManager",
    "Stack",
    "Storage",
    "StorageFill",
}


@dataclass(frozen=True)
class EntityPrototype:
    id: str
    parents: tuple[str, ...]
    abstract: bool
    source_file: str
    origin: str
    fields: dict[str, Any]
    components: tuple[dict[str, Any], ...]


def normalize_parents(value: Any) -> tuple[str, ...]:
    if isinstance(value, str):
        return (value,)
    if isinstance(value, list):
        return tuple(item for item in value if isinstance(item, str))
    return ()


def origin_from_path(path: str) -> str:
    if "/_Stories/" in path:
        return "stories"
    if "/_RMC14/" in path:
        return "rmc14"
    return "upstream"


def iter_prototype_documents(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig") as stream:
        for document in yaml.load_all(stream, Loader=GameYamlLoader):
            if document is None:
                continue
            values = document if isinstance(document, list) else [document]
            for value in values:
                if isinstance(value, dict):
                    yield value


def read_entity_prototypes(game_source: Path) -> dict[str, EntityPrototype]:
    root = game_source / "Resources/Prototypes"
    if not root.is_dir():
        raise FileNotFoundError(f"Missing prototype directory: {root}")

    result: dict[str, EntityPrototype] = {}
    files = sorted([*root.rglob("*.yml"), *root.rglob("*.yaml")])

    for path in files:
        source_file = path.relative_to(game_source).as_posix()
        for raw in iter_prototype_documents(path):
            if raw.get("type") != "entity":
                continue
            prototype_id = raw.get("id")
            if not isinstance(prototype_id, str) or not prototype_id:
                continue
            if prototype_id in result:
                previous = result[prototype_id].source_file
                raise RuntimeError(
                    f"Duplicate entity prototype {prototype_id}: "
                    f"{previous}, {source_file}"
                )

            raw_components = raw.get("components", [])
            components: list[dict[str, Any]] = []
            if isinstance(raw_components, list):
                components = [
                    copy.deepcopy(component)
                    for component in raw_components
                    if isinstance(component, dict)
                    and isinstance(component.get("type"), str)
                ]

            fields = {
                key: copy.deepcopy(value)
                for key, value in raw.items()
                if key not in {"type", "id", "parent", "abstract", "components"}
            }
            result[prototype_id] = EntityPrototype(
                id=prototype_id,
                parents=normalize_parents(raw.get("parent")),
                abstract=bool(raw.get("abstract", False)),
                source_file=source_file,
                origin=origin_from_path(source_file),
                fields=fields,
                components=tuple(components),
            )

    if not result:
        raise RuntimeError("No entity prototypes found")
    return result


class PrototypeResolver:
    """Resolve entity inheritance with component-level SS14 semantics."""

    def __init__(self, prototypes: dict[str, EntityPrototype]):
        self.prototypes = prototypes
        self.cache: dict[str, dict[str, Any]] = {}
        self.active: list[str] = []

    def resolve(self, prototype_id: str) -> dict[str, Any]:
        cached = self.cache.get(prototype_id)
        if cached is not None:
            return cached

        prototype = self.prototypes.get(prototype_id)
        if prototype is None:
            raise RuntimeError(f"Unknown entity prototype: {prototype_id}")
        if prototype_id in self.active:
            start = self.active.index(prototype_id)
            cycle = self.active[start:] + [prototype_id]
            raise RuntimeError("Entity inheritance cycle: " + " -> ".join(cycle))

        self.active.append(prototype_id)
        fields: dict[str, Any] = {}
        components: dict[str, dict[str, Any]] = {}

        for parent_id in prototype.parents:
            if parent_id not in self.prototypes:
                raise RuntimeError(
                    f"Unknown parent {parent_id} used by {prototype_id}"
                )
            parent = self.resolve(parent_id)
            fields.update(copy.deepcopy(parent["fields"]))
            for component_type, component in parent["components"].items():
                merged_parent = copy.deepcopy(components.get(component_type, {}))
                merged_parent.update(copy.deepcopy(component))
                components[component_type] = merged_parent

        # Prototype fields and individual component fields replace the matching
        # inherited field as a whole. Nested maps are intentionally not merged:
        # Empty weapon variants rely on replacing ItemSlots.slots so an inherited
        # startingItem does not survive.
        fields.update(copy.deepcopy(prototype.fields))
        for raw_component in prototype.components:
            component_type = raw_component["type"]
            merged = copy.deepcopy(components.get(component_type, {}))
            merged.update(
                {
                    key: copy.deepcopy(value)
                    for key, value in raw_component.items()
                    if key != "type"
                }
            )
            components[component_type] = merged

        self.active.pop()
        resolved = {
            "id": prototype_id,
            "parents": list(prototype.parents),
            "abstract": prototype.abstract,
            "sourceFile": prototype.source_file,
            "origin": prototype.origin,
            "fields": fields,
            "components": components,
        }
        self.cache[prototype_id] = resolved
        return resolved


def read_fluent_messages(locale_root: Path) -> dict[str, str]:
    if not locale_root.is_dir():
        raise FileNotFoundError(f"Missing locale directory: {locale_root}")

    messages: dict[str, str] = {}
    for path in sorted(locale_root.rglob("*.ftl")):
        current_key: str | None = None
        current_attribute: str | None = None
        parts: list[str] = []

        def flush() -> None:
            nonlocal parts
            if current_key is None:
                parts = []
                return
            key = current_key
            if current_attribute is not None:
                key += "." + current_attribute
            value = " ".join(part.strip() for part in parts if part.strip())
            if value and key not in messages:
                messages[key] = value
            parts = []

        for line in path.read_text(encoding="utf-8-sig").splitlines():
            message_match = FTL_MESSAGE_RE.match(line)
            if message_match:
                flush()
                current_key = message_match.group(1)
                current_attribute = None
                parts = [message_match.group(2)]
                continue

            attribute_match = FTL_ATTRIBUTE_RE.match(line)
            if attribute_match and current_key is not None:
                flush()
                current_attribute = attribute_match.group(1)
                parts = [attribute_match.group(2)]
                continue

            if current_key is not None and line.startswith((" ", "\t")):
                stripped = line.strip()
                if stripped and not stripped.startswith("#"):
                    parts.append(stripped)
                continue

            if not line.strip():
                flush()
                current_key = None
                current_attribute = None

        flush()

    return messages


class Localizer:
    def __init__(self, messages: dict[str, str]):
        self.messages = messages

    def resolve_key(self, key: str, active: tuple[str, ...] = ()) -> str | None:
        if key in active:
            return None
        value = self.messages.get(key)
        if value is None:
            return None
        reference = FTL_REFERENCE_RE.match(value.strip())
        if reference:
            target = reference.group(1)
            if reference.group(2):
                target += "." + reference.group(2)
            return self.resolve_key(target, active + (key,))
        return value

    def entity_text(
        self,
        prototype_id: str,
        attribute: str | None,
        fallback: Any,
    ) -> str:
        key = f"ent-{prototype_id}"
        if attribute:
            key += "." + attribute
        localized = self.resolve_key(key)
        if localized:
            return localized
        if isinstance(fallback, str) and fallback.strip():
            fallback_reference = FTL_REFERENCE_RE.match(fallback.strip())
            if fallback_reference:
                target = fallback_reference.group(1)
                if fallback_reference.group(2):
                    target += "." + fallback_reference.group(2)
                resolved = self.resolve_key(target)
                if resolved:
                    return resolved
            return fallback
        return prototype_id if attribute is None else ""


def read_config(path: Path) -> dict[str, Any]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError("Equipment config must be a mapping")
    vendors = data.get("vendors")
    if not isinstance(vendors, list) or not vendors:
        raise RuntimeError("Equipment config has no vendors")
    ids = [entry.get("id") for entry in vendors if isinstance(entry, dict)]
    if len(ids) != len(vendors) or any(not isinstance(item, str) for item in ids):
        raise RuntimeError("Every configured vendor must have a string id")
    if len(set(ids)) != len(ids):
        raise RuntimeError("Duplicate vendor id in equipment config")
    return data


def capitalize_first(value: str) -> str:
    """Uppercase the first visible letter without changing the rest of a name."""
    for index, character in enumerate(value):
        if character.isdigit():
            return value
        if character.isalpha():
            return value[:index] + character.upper() + value[index + 1 :]
    return value


def relation_key(relation: dict[str, Any]) -> str:
    return json.dumps(relation, ensure_ascii=False, sort_keys=True)


def add_relation(
    relations: list[dict[str, Any]],
    known: set[str],
    relation: dict[str, Any],
) -> bool:
    key = relation_key(relation)
    if key in known:
        return False
    known.add(key)
    relations.append(relation)
    return True


def content_relations(
    prototype_id: str,
    resolved: dict[str, Any],
) -> list[dict[str, Any]]:
    components = resolved["components"]
    result: list[dict[str, Any]] = []

    storage_fill = components.get("StorageFill", {})
    contents = storage_fill.get("contents")
    if isinstance(contents, list):
        for position, entry in enumerate(contents):
            if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
                continue
            relation: dict[str, Any] = {
                "from": prototype_id,
                "to": entry["id"],
                "type": "contains",
                "position": position,
                "quantity": entry.get("amount", 1),
            }
            for key in ("maxAmount", "prob", "orGroup"):
                if key in entry:
                    relation[key] = entry[key]
            result.append(relation)

    container_fill = components.get("ContainerFill", {})
    containers = container_fill.get("containers")
    if isinstance(containers, dict):
        for container_name, entries in containers.items():
            if not isinstance(entries, list):
                continue
            for position, entry in enumerate(entries):
                if isinstance(entry, str):
                    result.append(
                        {
                            "from": prototype_id,
                            "to": entry,
                            "type": "contains",
                            "container": str(container_name),
                            "position": position,
                            "quantity": 1,
                        }
                    )

    cm_slots = components.get("CMItemSlots", {})
    starting_item = cm_slots.get("startingItem")
    count = cm_slots.get("count", 1)
    if isinstance(starting_item, str):
        result.append(
            {
                "from": prototype_id,
                "to": starting_item,
                "type": "slotItem",
                "quantity": count if isinstance(count, int) else 1,
            }
        )
    starting_items = cm_slots.get("startingItems")
    if isinstance(starting_items, list):
        for position, entry in enumerate(starting_items):
            if isinstance(entry, str):
                result.append(
                    {
                        "from": prototype_id,
                        "to": entry,
                        "type": "slotItem",
                        "position": position,
                        "quantity": 1,
                    }
                )

    item_slots = components.get("ItemSlots", {}).get("slots")
    if isinstance(item_slots, dict):
        for slot_name, slot in item_slots.items():
            if not isinstance(slot, dict):
                continue
            item = slot.get("startingItem")
            if isinstance(item, str):
                result.append(
                    {
                        "from": prototype_id,
                        "to": item,
                        "type": "loadedWith",
                        "slot": str(slot_name),
                        "quantity": 1,
                    }
                )

    attachment_slots = components.get("AttachableHolder", {}).get("slots")
    if isinstance(attachment_slots, dict):
        for slot_name, slot in attachment_slots.items():
            if not isinstance(slot, dict):
                continue
            item = slot.get("startingAttachable")
            if isinstance(item, str):
                result.append(
                    {
                        "from": prototype_id,
                        "to": item,
                        "type": "installedAttachment",
                        "slot": str(slot_name),
                        "quantity": 1,
                    }
                )

    bundle = components.get("CMVendorBundle", {}).get("bundle")
    if isinstance(bundle, list):
        for position, item in enumerate(bundle):
            if isinstance(item, str):
                result.append(
                    {
                        "from": prototype_id,
                        "to": item,
                        "type": "bundleItem",
                        "position": position,
                        "quantity": 1,
                    }
                )

    variants = components.get("RMCArmorVariant", {}).get("types")
    if isinstance(variants, dict):
        for variant_name, item in variants.items():
            if isinstance(item, str):
                result.append(
                    {
                        "from": prototype_id,
                        "to": item,
                        "type": "variant",
                        "variant": str(variant_name),
                        "quantity": 1,
                    }
                )

    provider = components.get("BallisticAmmoProvider", {})
    ammo = provider.get("proto")
    if isinstance(ammo, str):
        relation = {
            "from": prototype_id,
            "to": ammo,
            "type": "loadedWith",
        }
        capacity = provider.get("capacity")
        if isinstance(capacity, int):
            relation["quantity"] = capacity
        result.append(relation)

    cartridge = components.get("CartridgeAmmo", {})
    projectile = cartridge.get("proto")
    if isinstance(projectile, str):
        result.append(
            {
                "from": prototype_id,
                "to": projectile,
                "type": "fires",
                "quantity": 1,
            }
        )

    bullet_box = components.get("RefillableByBulletBox", {}).get("bulletType")
    if isinstance(bullet_box, str):
        result.append(
            {
                "from": prototype_id,
                "to": bullet_box,
                "type": "refillableBy",
            }
        )

    return result


def whitelist_matches(
    whitelist: Any,
    candidate_id: str,
    candidate_tags: set[str],
    candidate_components: set[str],
) -> bool:
    if not isinstance(whitelist, dict):
        return False
    entities = whitelist.get("entities", [])
    if isinstance(entities, list) and candidate_id in entities:
        return True
    tags = whitelist.get("tags", [])
    if isinstance(tags, list) and candidate_tags.intersection(
        item for item in tags if isinstance(item, str)
    ):
        return True
    components = whitelist.get("components", [])
    if isinstance(components, list) and candidate_components.intersection(
        item for item in components if isinstance(item, str)
    ):
        return True
    return False


def add_compatibility_relations(
    item_ids: set[str],
    resolver: PrototypeResolver,
    relations: list[dict[str, Any]],
    relation_keys: set[str],
) -> None:
    candidate_data: dict[str, tuple[set[str], set[str]]] = {}
    attachments: set[str] = set()
    magazines: set[str] = set()

    for item_id in item_ids:
        resolved = resolver.resolve(item_id)
        components = resolved["components"]
        tags = components.get("Tag", {}).get("tags", [])
        tag_set = {item for item in tags if isinstance(item, str)} if isinstance(tags, list) else set()
        component_set = set(components)
        candidate_data[item_id] = (tag_set, component_set)
        if "Attachable" in component_set:
            attachments.add(item_id)
        if "BallisticAmmoProvider" in component_set and "Gun" not in component_set:
            magazines.add(item_id)

    for weapon_id in sorted(item_ids):
        components = resolver.resolve(weapon_id)["components"]

        attachment_slots = components.get("AttachableHolder", {}).get("slots")
        if isinstance(attachment_slots, dict):
            for slot_name, slot in attachment_slots.items():
                if not isinstance(slot, dict):
                    continue
                whitelist = slot.get("whitelist")
                blacklist = slot.get("blacklist")
                for attachment_id in sorted(attachments):
                    tags, component_types = candidate_data[attachment_id]
                    if not whitelist_matches(
                        whitelist, attachment_id, tags, component_types
                    ):
                        continue
                    if whitelist_matches(
                        blacklist, attachment_id, tags, component_types
                    ):
                        continue
                    add_relation(
                        relations,
                        relation_keys,
                        {
                            "from": weapon_id,
                            "to": attachment_id,
                            "type": "compatibleAttachment",
                            "slot": str(slot_name),
                        },
                    )

        item_slots = components.get("ItemSlots", {}).get("slots")
        if isinstance(item_slots, dict):
            for slot_name, slot in item_slots.items():
                if not isinstance(slot, dict):
                    continue
                whitelist = slot.get("whitelist")
                blacklist = slot.get("blacklist")
                for magazine_id in sorted(magazines):
                    tags, component_types = candidate_data[magazine_id]
                    if not whitelist_matches(
                        whitelist, magazine_id, tags, component_types
                    ):
                        continue
                    if whitelist_matches(
                        blacklist, magazine_id, tags, component_types
                    ):
                        continue
                    add_relation(
                        relations,
                        relation_keys,
                        {
                            "from": weapon_id,
                            "to": magazine_id,
                            "type": "compatibleMagazine",
                            "slot": str(slot_name),
                        },
                    )


def infer_types(components: dict[str, Any], tags: set[str]) -> list[str]:
    result: set[str] = set()
    component_types = set(components)

    if "Gun" in component_types or "RMCFlamerAmmoProvider" in component_types:
        result.add("weapon")
    if "Attachable" in component_types:
        result.add("attachment")
    if "Projectile" in component_types:
        result.add("projectile")
    if "CartridgeAmmo" in component_types:
        result.add("cartridge")
    if "BallisticAmmoProvider" in component_types and "Gun" not in component_types:
        result.add("magazine-or-ammo-container")
    if "Storage" in component_types or "CMItemSlots" in component_types:
        result.add("container")
    if "Armor" in component_types or "RMCArmor" in component_types:
        result.add("armor")
    if "Explosive" in component_types or any("Grenade" in tag for tag in tags):
        result.add("explosive")
    if "MeleeWeapon" in component_types:
        result.add("melee")
    if not result:
        result.add("misc")
    return sorted(result)


def sprite_summary(components: dict[str, Any]) -> dict[str, Any] | None:
    sprite = components.get("Sprite")
    if not isinstance(sprite, dict):
        return None
    result: dict[str, Any] = {}
    if isinstance(sprite.get("sprite"), str):
        result["sprite"] = sprite["sprite"]
    if isinstance(sprite.get("state"), str):
        result["state"] = sprite["state"]
    layers = sprite.get("layers")
    if isinstance(layers, list):
        clean_layers = [layer for layer in layers if isinstance(layer, dict)]
        if clean_layers:
            result["layers"] = clean_layers
            if "state" not in result:
                for layer in clean_layers:
                    state = layer.get("state")
                    if isinstance(state, str):
                        result["state"] = state
                        break
    return result or None


def texture_path(game_source: Path, sprite_path: str) -> Path:
    normalized = sprite_path.replace("\\", "/").lstrip("/")
    if normalized.startswith("Textures/"):
        normalized = normalized[len("Textures/") :]
    return game_source / "Resources/Textures" / normalized


def first_rsi_state(meta: dict[str, Any]) -> str | None:
    states = meta.get("states")
    if not isinstance(states, list):
        return None
    for state in states:
        if isinstance(state, dict) and isinstance(state.get("name"), str):
            return state["name"]
    return None


def load_sprite_frame(
    game_source: Path,
    sprite_path: str,
    state: str | None,
) -> Image.Image:
    source = texture_path(game_source, sprite_path)
    if source.suffix.lower() != ".rsi":
        if not source.is_file():
            raise FileNotFoundError(f"Missing sprite texture: {source}")
        return Image.open(source).convert("RGBA")

    meta_path = source / "meta.json"
    if not meta_path.is_file():
        raise FileNotFoundError(f"Missing RSI metadata: {meta_path}")
    meta = json.loads(meta_path.read_text(encoding="utf-8-sig"))
    if not isinstance(meta, dict):
        raise RuntimeError(f"Invalid RSI metadata: {meta_path}")

    selected_state = state or first_rsi_state(meta)
    if not selected_state:
        raise RuntimeError(f"RSI has no states: {meta_path}")
    state_path = source / f"{selected_state}.png"
    if not state_path.is_file():
        fallback = first_rsi_state(meta)
        if not fallback:
            raise FileNotFoundError(
                f"Missing RSI state {selected_state}: {meta_path}"
            )
        state_path = source / f"{fallback}.png"
    sheet = Image.open(state_path).convert("RGBA")

    size = meta.get("size", {})
    width = size.get("x") if isinstance(size, dict) else None
    height = size.get("y") if isinstance(size, dict) else None
    if not isinstance(width, int) or not isinstance(height, int):
        width, height = sheet.height, sheet.height
    return sheet.crop((0, 0, min(width, sheet.width), min(height, sheet.height)))


def render_sprite_preview(
    game_source: Path,
    summary: dict[str, Any],
) -> Image.Image:
    base_sprite = summary.get("sprite")
    layers = summary.get("layers")
    render_layers: list[tuple[str, str | None]] = []

    if isinstance(layers, list):
        for layer in layers:
            if not isinstance(layer, dict) or layer.get("visible") is False:
                continue
            layer_sprite = layer.get("sprite", base_sprite)
            layer_state = layer.get("state", summary.get("state"))
            if isinstance(layer_sprite, str):
                render_layers.append(
                    (layer_sprite, layer_state if isinstance(layer_state, str) else None)
                )
            elif isinstance(layer.get("texture"), str):
                render_layers.append((layer["texture"], None))

    if not render_layers and isinstance(base_sprite, str):
        state = summary.get("state")
        render_layers.append((base_sprite, state if isinstance(state, str) else None))
    if not render_layers:
        raise RuntimeError("Sprite component has no renderable texture")

    images = [
        load_sprite_frame(game_source, sprite_path, state)
        for sprite_path, state in render_layers
    ]
    width = max(image.width for image in images)
    height = max(image.height for image in images)
    preview = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    for layer in images:
        x = (width - layer.width) // 2
        y = (height - layer.height) // 2
        preview.alpha_composite(layer, (x, y))
    return preview


def public_category(item: dict[str, Any]) -> str:
    types = item.get("types", [])
    if not isinstance(types, list):
        return "Прочее"
    for item_type in (
        "weapon",
        "attachment",
        "explosive",
        "magazine-or-ammo-container",
        "cartridge",
        "armor",
        "melee",
        "container",
        "misc",
    ):
        if item_type in types:
            return PUBLIC_CATEGORY_LABELS[item_type]
    return "Прочее"


def is_case_item(item: dict[str, Any]) -> bool:
    name = str(item.get("name", "")).casefold()
    prototype_id = str(item.get("id", ""))
    component_types = set(item.get("componentTypes", []))
    return (
        "StorageFill" in component_types
        and ("кейс" in name or "case" in prototype_id.casefold())
    )


def build_public_catalog(
    trade_entries: list[dict[str, Any]],
    items: dict[str, Any],
    relations: list[dict[str, Any]],
) -> dict[str, Any]:
    case_contents: dict[str, list[str]] = defaultdict(list)
    for relation in relations:
        if relation.get("type") in CASE_CONTENT_RELATION_TYPES:
            case_contents[relation["from"]].append(relation["to"])

    public_ids: set[str] = set()
    queue = deque(
        entry["itemId"]
        for entry in trade_entries
        if isinstance(entry.get("itemId"), str)
    )
    visited_cases: set[str] = set()
    while queue:
        item_id = queue.popleft()
        item = items[item_id]
        if not is_case_item(item):
            public_ids.add(item_id)
            continue
        if item_id in visited_cases:
            continue
        visited_cases.add(item_id)
        queue.extend(case_contents.get(item_id, []))

    categories: dict[str, list[str]] = defaultdict(list)
    for item_id in sorted(public_ids, key=lambda value: items[value]["name"].casefold()):
        category = public_category(items[item_id])
        items[item_id]["category"] = category
        items[item_id]["public"] = True
        categories[category].append(item_id)

    return {
        "itemIds": sorted(public_ids, key=lambda value: items[value]["name"].casefold()),
        "categories": dict(sorted(categories.items())),
        "unwrappedCaseIds": sorted(visited_cases),
    }


def render_public_sprites(
    game_source: Path,
    output_dir: Path,
    items: dict[str, Any],
    public_item_ids: list[str],
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    expected: set[str] = set()
    failures: list[str] = []

    for item_id in public_item_ids:
        item = items[item_id]
        summary = item.get("sprite")
        if not isinstance(summary, dict):
            failures.append(f"{item_id}: no Sprite component")
            continue
        filename = f"{item_id}.png"
        expected.add(filename)
        try:
            preview = render_sprite_preview(game_source, summary)
            preview.save(output_dir / filename, format="PNG", optimize=True)
            item["image"] = f"equipment-sprites/{filename}"
        except Exception as error:  # Collect every missing/broken sprite in one run.
            failures.append(f"{item_id}: {error}")

    for path in output_dir.glob("*.png"):
        if path.name not in expected:
            path.unlink()
    if failures:
        raise RuntimeError("Unable to render equipment sprites:\n" + "\n".join(failures))


def should_publish_component(component_type: str) -> bool:
    return (
        component_type in CORE_COMPONENTS
        or component_type.startswith("Attachable")
        or "Gun" in component_type
        or component_type.startswith("RMCWeapon")
        or component_type.startswith("RMCProjectile")
    )


def build_card(
    prototype_id: str,
    resolved: dict[str, Any],
    localizer: Localizer,
    availability: list[dict[str, Any]],
    reachable_vendors: set[str],
) -> dict[str, Any]:
    components = resolved["components"]
    raw_tags = components.get("Tag", {}).get("tags", [])
    tags = {item for item in raw_tags if isinstance(item, str)} if isinstance(raw_tags, list) else set()
    fields = resolved["fields"]

    properties = {
        component_type: copy.deepcopy(component)
        for component_type, component in sorted(components.items())
        if should_publish_component(component_type)
    }

    card: dict[str, Any] = {
        "id": prototype_id,
        "name": capitalize_first(
            localizer.entity_text(prototype_id, None, fields.get("name"))
        ),
        "description": localizer.entity_text(
            prototype_id, "desc", fields.get("description")
        ),
        "suffix": localizer.entity_text(
            prototype_id, "suffix", fields.get("suffix")
        ),
        "origin": resolved["origin"],
        "sourceFile": resolved["sourceFile"],
        "parents": resolved["parents"],
        "abstract": resolved["abstract"],
        "types": infer_types(components, tags),
        "tags": sorted(tags),
        "componentTypes": sorted(components),
        "properties": properties,
        "availability": availability,
        "directlyVended": bool(availability),
        "reachableFromVendors": sorted(reachable_vendors),
    }
    sprite = sprite_summary(components)
    if sprite:
        card["sprite"] = sprite
    return card


def build_catalog(
    prototypes: dict[str, EntityPrototype],
    config: dict[str, Any],
    localizer: Localizer,
    game_commit: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    resolver = PrototypeResolver(prototypes)
    vendor_ids = [entry["id"] for entry in config["vendors"]]
    vendors: dict[str, Any] = {}
    trade_entries: list[dict[str, Any]] = []
    availability_by_item: dict[str, list[dict[str, Any]]] = defaultdict(list)
    reachable_vendors: dict[str, set[str]] = defaultdict(set)
    item_ids: set[str] = set()
    queue: deque[str] = deque()

    for vendor_id in vendor_ids:
        vendor = resolver.resolve(vendor_id)
        component = vendor["components"].get("CMAutomatedVendor")
        if not isinstance(component, dict):
            raise RuntimeError(f"Vendor {vendor_id} has no CMAutomatedVendor")
        sections = component.get("sections")
        if not isinstance(sections, list) or not sections:
            raise RuntimeError(f"Vendor {vendor_id} has no sections")

        vendor_sections: list[dict[str, Any]] = []
        for section_index, raw_section in enumerate(sections):
            if not isinstance(raw_section, dict):
                continue
            raw_entries = raw_section.get("entries")
            if not isinstance(raw_entries, list):
                continue
            section_name = raw_section.get("name")
            if not isinstance(section_name, str):
                section_name = f"Section {section_index + 1}"
            section_key = f"{vendor_id}:{section_index}"
            section_trade_keys: list[str] = []

            for entry_index, raw_entry in enumerate(raw_entries):
                if not isinstance(raw_entry, dict):
                    continue
                item_id = raw_entry.get("id")
                if not isinstance(item_id, str):
                    raise RuntimeError(
                        f"Vendor entry without id: {vendor_id}/{section_name}/{entry_index}"
                    )
                if item_id not in prototypes:
                    raise RuntimeError(
                        f"Vendor {vendor_id} references unknown item {item_id}"
                    )
                trade_key = f"{vendor_id}:{section_index}:{entry_index}"
                item = resolver.resolve(item_id)
                display_name = raw_entry.get("name")
                if not isinstance(display_name, str):
                    display_name = localizer.entity_text(
                        item_id, None, item["fields"].get("name")
                    )

                trade: dict[str, Any] = {
                    "key": trade_key,
                    "vendorId": vendor_id,
                    "sectionKey": section_key,
                    "sectionName": section_name,
                    "position": entry_index,
                    "itemId": item_id,
                    "name": display_name,
                    "amount": raw_entry.get("amount"),
                    "spawn": raw_entry.get("spawn", 1),
                }
                stock_item = raw_entry.get("box")
                if isinstance(stock_item, str):
                    if stock_item not in prototypes:
                        raise RuntimeError(
                            f"Trade {trade_key} references unknown stock item {stock_item}"
                        )
                    trade["stock"] = {
                        "itemId": stock_item,
                        "amount": raw_entry.get("boxAmount"),
                        "slots": raw_entry.get("boxSlots"),
                    }
                for key in (
                    "points",
                    "recommended",
                    "multiplier",
                    "max",
                    "linkedEntries",
                ):
                    if key in raw_entry:
                        trade[key] = copy.deepcopy(raw_entry[key])

                trade_entries.append(trade)
                section_trade_keys.append(trade_key)
                availability = {
                    "vendorId": vendor_id,
                    "sectionKey": section_key,
                    "sectionName": section_name,
                    "tradeKey": trade_key,
                }
                availability_by_item[item_id].append(availability)
                if vendor_id not in reachable_vendors[item_id]:
                    reachable_vendors[item_id].add(vendor_id)
                if item_id not in item_ids:
                    item_ids.add(item_id)
                    queue.append(item_id)

            vendor_sections.append(
                {
                    "key": section_key,
                    "name": section_name,
                    "position": section_index,
                    "hasBoxes": bool(raw_section.get("hasBoxes", False)),
                    "tradeKeys": section_trade_keys,
                }
            )

        vendors[vendor_id] = {
            "id": vendor_id,
            "name": localizer.entity_text(
                vendor_id, None, vendor["fields"].get("name")
            ),
            "description": localizer.entity_text(
                vendor_id, "desc", vendor["fields"].get("description")
            ),
            "sourceFile": vendor["sourceFile"],
            "sections": vendor_sections,
        }

    relations: list[dict[str, Any]] = []
    relation_keys: set[str] = set()
    outgoing: dict[str, list[str]] = defaultdict(list)

    while queue:
        item_id = queue.popleft()
        resolved = resolver.resolve(item_id)
        for relation in content_relations(item_id, resolved):
            target = relation["to"]
            if target not in prototypes:
                raise RuntimeError(
                    f"{item_id} has {relation['type']} relation to unknown entity {target}"
                )
            if add_relation(relations, relation_keys, relation):
                outgoing[item_id].append(target)
            changed = False
            for vendor_id in reachable_vendors[item_id]:
                if vendor_id not in reachable_vendors[target]:
                    reachable_vendors[target].add(vendor_id)
                    changed = True
            if target not in item_ids:
                item_ids.add(target)
                queue.append(target)
            elif changed:
                queue.append(target)

    # Source propagation can revisit a node after its relations were added. The
    # relation set de-duplicates those visits while the vendor provenance flows.
    provenance_queue = deque(sorted(item_ids))
    while provenance_queue:
        source = provenance_queue.popleft()
        for target in outgoing.get(source, []):
            before = len(reachable_vendors[target])
            reachable_vendors[target].update(reachable_vendors[source])
            if len(reachable_vendors[target]) != before:
                provenance_queue.append(target)

    add_compatibility_relations(item_ids, resolver, relations, relation_keys)

    items: dict[str, Any] = {}
    for item_id in sorted(item_ids):
        items[item_id] = build_card(
            item_id,
            resolver.resolve(item_id),
            localizer,
            availability_by_item.get(item_id, []),
            reachable_vendors[item_id],
        )

    relations.sort(
        key=lambda item: (
            item["from"],
            item["type"],
            item["to"],
            str(item.get("slot", "")),
            int(item.get("position", -1)),
        )
    )
    trade_entries.sort(key=lambda item: item["key"])

    public_catalog = build_public_catalog(trade_entries, items, relations)

    counts = {
        "indexedEntityPrototypes": len(prototypes),
        "vendors": len(vendors),
        "sections": sum(len(vendor["sections"]) for vendor in vendors.values()),
        "tradeEntries": len(trade_entries),
        "directItemPrototypes": len(availability_by_item),
        "catalogItems": len(items),
        "publicItems": len(public_catalog["itemIds"]),
        "relations": len(relations),
    }

    catalog = {
        "schemaVersion": 1,
        "gameCommit": game_commit,
        "source": "MetalSage/space-stories-cm14",
        "locale": "ru-RU",
        "configuredVendorIds": vendor_ids,
        "vendors": vendors,
        "tradeEntries": trade_entries,
        "items": items,
        "publicCatalog": public_catalog,
        "relations": relations,
        "counts": counts,
    }

    index = {
        "schemaVersion": 1,
        "gameCommit": game_commit,
        "source": "MetalSage/space-stories-cm14",
        "counts": {
            "indexedEntityPrototypes": len(prototypes),
            "catalogEntityPrototypes": len(item_ids),
            "resolvedEntityPrototypes": len(resolver.cache),
        },
        "entries": {
            prototype_id: {
                "parents": list(prototype.parents),
                "abstract": prototype.abstract,
                "origin": prototype.origin,
                "sourceFile": prototype.source_file,
            }
            for prototype_id, prototype in sorted(prototypes.items())
            if prototype_id in item_ids
        },
    }
    return index, catalog


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the SSMC equipment catalog from live game sources"
    )
    parser.add_argument("--game-source", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--index-output", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--sprites-output", type=Path, required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--locale", default="ru-RU")
    args = parser.parse_args()

    prototypes = read_entity_prototypes(args.game_source)
    config = read_config(args.config)
    locale_root = args.game_source / "Resources/Locale" / args.locale
    localizer = Localizer(read_fluent_messages(locale_root))
    index, catalog = build_catalog(
        prototypes=prototypes,
        config=config,
        localizer=localizer,
        game_commit=args.commit,
    )
    render_public_sprites(
        game_source=args.game_source,
        output_dir=args.sprites_output,
        items=catalog["items"],
        public_item_ids=catalog["publicCatalog"]["itemIds"],
    )
    write_json(args.index_output, index)
    write_json(args.output, catalog)

    counts = catalog["counts"]
    print(f"Indexed entity prototypes: {counts['indexedEntityPrototypes']}")
    print(f"Vendor sections: {counts['sections']}")
    print(f"Trade entries: {counts['tradeEntries']}")
    print(f"Catalog items: {counts['catalogItems']}")
    print(f"Public equipment items: {counts['publicItems']}")
    print(f"Relations: {counts['relations']}")


if __name__ == "__main__":
    main()
