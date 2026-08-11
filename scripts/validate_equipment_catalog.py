from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml
from PIL import Image


HIERARCHICAL_RELATIONS = {
    "contains",
    "slotItem",
    "loadedWith",
    "installedAttachment",
    "bundleItem",
    "variant",
    "fires",
}


def read_json(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError(f"Expected JSON object: {path}")
    return data


def configured_vendors(path: Path) -> list[str]:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("vendors"), list):
        raise RuntimeError("Invalid equipment config")
    result = []
    for entry in data["vendors"]:
        if not isinstance(entry, dict) or not isinstance(entry.get("id"), str):
            raise RuntimeError("Invalid configured vendor")
        result.append(entry["id"])
    return result


def validate_no_hierarchical_cycles(relations: list[dict[str, Any]]) -> None:
    graph: dict[str, list[str]] = defaultdict(list)
    for relation in relations:
        if relation.get("type") in HIERARCHICAL_RELATIONS:
            graph[relation["from"]].append(relation["to"])

    state: dict[str, int] = {}
    active: list[str] = []

    def visit(node: str) -> None:
        status = state.get(node, 0)
        if status == 2:
            return
        if status == 1:
            start = active.index(node)
            raise RuntimeError(
                "Equipment relation cycle: " + " -> ".join(active[start:] + [node])
            )
        state[node] = 1
        active.append(node)
        for target in graph.get(node, []):
            visit(target)
        active.pop()
        state[node] = 2

    for node in sorted(graph):
        visit(node)


def validate(
    catalog: dict[str, Any],
    index: dict[str, Any],
    config: Path,
    sprites: Path,
) -> None:
    if catalog.get("schemaVersion") != 1:
        raise RuntimeError("Unexpected equipment catalog schema")
    if index.get("schemaVersion") != 1:
        raise RuntimeError("Unexpected equipment index schema")
    if catalog.get("gameCommit") != index.get("gameCommit"):
        raise RuntimeError("Catalog and index were built from different commits")

    expected_vendors = configured_vendors(config)
    vendors = catalog.get("vendors")
    trades = catalog.get("tradeEntries")
    items = catalog.get("items")
    relations = catalog.get("relations")
    counts = catalog.get("counts")
    public_catalog = catalog.get("publicCatalog")

    if not isinstance(vendors, dict) or list(vendors) != expected_vendors:
        raise RuntimeError(
            f"Unexpected vendors: expected={expected_vendors}, "
            f"actual={list(vendors) if isinstance(vendors, dict) else vendors}"
        )
    if not isinstance(trades, list) or not trades:
        raise RuntimeError("No equipment trade entries")
    if not isinstance(items, dict) or not items:
        raise RuntimeError("No equipment items")
    if not isinstance(relations, list):
        raise RuntimeError("Invalid equipment relations")
    if not isinstance(counts, dict):
        raise RuntimeError("Missing equipment counts")
    if not isinstance(public_catalog, dict):
        raise RuntimeError("Missing public equipment catalog")

    trade_keys: set[str] = set()
    direct_ids: set[str] = set()
    for trade in trades:
        if not isinstance(trade, dict):
            raise RuntimeError("Invalid trade entry")
        key = trade.get("key")
        item_id = trade.get("itemId")
        vendor_id = trade.get("vendorId")
        if not isinstance(key, str) or key in trade_keys:
            raise RuntimeError(f"Duplicate or invalid trade key: {key}")
        if item_id not in items:
            raise RuntimeError(f"Trade {key} references missing item {item_id}")
        if vendor_id not in vendors:
            raise RuntimeError(f"Trade {key} references missing vendor {vendor_id}")
        stock = trade.get("stock")
        if stock is not None:
            stock_id = stock.get("itemId") if isinstance(stock, dict) else None
            if stock_id not in index.get("entries", {}):
                raise RuntimeError(f"Trade {key} has unknown stock item {stock_id}")
        trade_keys.add(key)
        direct_ids.add(item_id)

    for item_id, item in items.items():
        if not isinstance(item, dict) or item.get("id") != item_id:
            raise RuntimeError(f"Invalid item card: {item_id}")
        if item_id not in index.get("entries", {}):
            raise RuntimeError(f"Catalog item missing from index: {item_id}")
        reachable = item.get("reachableFromVendors")
        if not isinstance(reachable, list) or not reachable:
            raise RuntimeError(f"Item has no source path: {item_id}")
        unknown_vendors = set(reachable) - set(vendors)
        if unknown_vendors:
            raise RuntimeError(
                f"Item {item_id} has unknown source vendors: {sorted(unknown_vendors)}"
            )

    public_ids = public_catalog.get("itemIds")
    unwrapped_cases = public_catalog.get("unwrappedCaseIds")
    categories = public_catalog.get("categories")
    if not isinstance(public_ids, list) or not public_ids:
        raise RuntimeError("Public equipment catalog is empty")
    if len(public_ids) != len(set(public_ids)):
        raise RuntimeError("Public equipment catalog contains duplicate items")
    if not isinstance(unwrapped_cases, list) or not unwrapped_cases:
        raise RuntimeError("No equipment cases were unwrapped")
    leaked_cases = sorted(set(public_ids).intersection(unwrapped_cases))
    if leaked_cases:
        raise RuntimeError(f"Cases leaked into public catalog: {leaked_cases}")
    if not isinstance(categories, dict):
        raise RuntimeError("Missing public equipment categories")

    categorized_ids: list[str] = []
    for category, category_ids in categories.items():
        if not isinstance(category, str) or not isinstance(category_ids, list):
            raise RuntimeError("Invalid public equipment category")
        categorized_ids.extend(category_ids)
    if sorted(categorized_ids) != sorted(public_ids):
        raise RuntimeError("Public equipment categories do not match public items")

    for item_id in public_ids:
        if item_id not in items:
            raise RuntimeError(f"Public catalog references missing item: {item_id}")
        item = items[item_id]
        name = item.get("name")
        if not isinstance(name, str) or not name:
            raise RuntimeError(f"Public item has no name: {item_id}")
        for character in name:
            if character.isdigit():
                break
            if character.isalpha():
                if character != character.upper():
                    raise RuntimeError(
                        f"Public item name is not capitalized: {item_id}"
                    )
                break
        image = item.get("image")
        if image != f"equipment-sprites/{item_id}.png":
            raise RuntimeError(f"Public item has invalid image path: {item_id}")
        sprite_path = sprites / f"{item_id}.png"
        if not sprite_path.is_file() or sprite_path.stat().st_size == 0:
            raise RuntimeError(f"Public item sprite is missing: {item_id}")
        with Image.open(sprite_path) as image_file:
            if image_file.convert("RGBA").getbbox() is None:
                raise RuntimeError(f"Public item sprite is transparent: {item_id}")

    relation_keys: set[str] = set()
    for relation in relations:
        if not isinstance(relation, dict):
            raise RuntimeError("Invalid relation entry")
        source = relation.get("from")
        target = relation.get("to")
        relation_type = relation.get("type")
        if source not in items or target not in items:
            raise RuntimeError(
                f"Relation references missing item: {source} -[{relation_type}]-> {target}"
            )
        key = json.dumps(relation, ensure_ascii=False, sort_keys=True)
        if key in relation_keys:
            raise RuntimeError(
                f"Duplicate relation: {source} -[{relation_type}]-> {target}"
            )
        relation_keys.add(key)

    validate_no_hierarchical_cycles(relations)

    index_counts = index.get("counts", {})
    if index_counts.get("catalogEntityPrototypes") != len(items):
        raise RuntimeError(
            "Equipment index catalog count does not match catalog items"
        )

    actual_counts = {
        "indexedEntityPrototypes": index_counts.get("indexedEntityPrototypes"),
        "vendors": len(vendors),
        "sections": sum(len(vendor.get("sections", [])) for vendor in vendors.values()),
        "tradeEntries": len(trades),
        "directItemPrototypes": len(direct_ids),
        "catalogItems": len(items),
        "publicItems": len(public_ids),
        "relations": len(relations),
    }
    if counts != actual_counts:
        raise RuntimeError(
            f"Equipment count mismatch: stored={counts}, actual={actual_counts}"
        )

    required_cases = {
        "RMCGunCasePistolMK80",
        "RMCGunCasePistolSmart",
        "RMCMOU53Case",
        "RMCCaseXM88",
        "RMCGunCaseRifleM54CE2",
        "RMCM54CMK1Case",
        "RMCML66DCase",
        "RMCM2CCase",
        "RMCCaseFlamer",
        "RMCM85A1Case",
        "RMCGunCasePistolM13",
    }
    missing_cases = required_cases - set(items)
    if missing_cases:
        raise RuntimeError(f"Required gun cases missing: {sorted(missing_cases)}")
    cases_without_contents = sorted(
        case_id
        for case_id in required_cases
        if not any(
            relation.get("from") == case_id
            and relation.get("type") == "contains"
            for relation in relations
        )
    )
    if cases_without_contents:
        raise RuntimeError(f"Gun cases have no contents: {cases_without_contents}")

    empty_weapons = {
        "RMCWeaponPistolM77Empty",
        "RMCWeaponRevolverM44Empty",
        "CMWeaponPistolM1984Empty",
        "RMCWeaponPistolM13Empty",
        "RMCWeaponPistolM82FEmpty",
    }
    incorrectly_loaded = sorted(
        weapon_id
        for weapon_id in empty_weapons
        if any(
            relation.get("from") == weapon_id
            and relation.get("type") == "loadedWith"
            for relation in relations
        )
    )
    if incorrectly_loaded:
        raise RuntimeError(
            f"Empty weapons inherited starting ammunition: {incorrectly_loaded}"
        )

    print(f"Vendors: {len(vendors)}")
    print(f"Sections: {actual_counts['sections']}")
    print(f"Trade entries: {len(trades)}")
    print(f"Direct item prototypes: {len(direct_ids)}")
    print(f"Catalog items: {len(items)}")
    print(f"Public equipment items: {len(public_ids)}")
    print(f"Relations: {len(relations)}")
    print("Equipment catalog validation passed")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate equipment catalog outputs")
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--index", type=Path, required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--sprites", type=Path, required=True)
    args = parser.parse_args()
    validate(
        read_json(args.catalog),
        read_json(args.index),
        args.config,
        args.sprites,
    )


if __name__ == "__main__":
    main()
