"""
Ping a MongoDB (Atlas o local) usando MONGODB_URI/MONGO_URI.

Uso:
  - Definir variable de entorno MONGODB_URI (preferido) o MONGO_URI.
  - Ejecutar: python docs/scripts/mongo_ping.py

Salida:
  - JSON con { ok: true, impl: "motor"|"pymongo", reply: {...} }
  - En caso de error: { ok: false, error: "..." }

Nota: No imprime la URI; solo resultado y errores.
"""

import os
import sys
import json
import argparse


def try_motor(uri: str):
    from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore
    import asyncio

    async def ping():
        client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=10000)
        res = await client.admin.command("ping")
        return res

    return asyncio.run(ping())


def try_pymongo(uri: str):
    from pymongo import MongoClient  # type: ignore

    client = MongoClient(uri, serverSelectionTimeoutMS=10000)
    res = client.admin.command("ping")
    return res


def main() -> int:
    parser = argparse.ArgumentParser(description="Ping MongoDB via URI or env")
    parser.add_argument("--uri", dest="uri", type=str, default=None, help="MongoDB connection URI (overrides env)")
    parser.add_argument("--timeout", dest="timeout", type=int, default=10000, help="serverSelectionTimeoutMS in ms")
    args = parser.parse_args()

    uri = args.uri or os.environ.get("MONGODB_URI") or os.environ.get("MONGO_URI")
    if not uri:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Missing MONGODB_URI or MONGO_URI env",
                },
                ensure_ascii=False,
            )
        )
        return 2

    # Intentar primero motor, luego pymongo
    try:
        try:
            # Ajustar timeout si se pasa por CLI
            from motor.motor_asyncio import AsyncIOMotorClient  # type: ignore
            import asyncio

            async def ping():
                client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=args.timeout)
                return await client.admin.command("ping")

            res = asyncio.run(ping())
            impl = "motor"
        except Exception as e_motor:
            try:
                from pymongo import MongoClient  # type: ignore
                client = MongoClient(uri, serverSelectionTimeoutMS=args.timeout)
                res = client.admin.command("ping")
                impl = "pymongo"
            except Exception as e_pymongo:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "impls_tried": ["motor", "pymongo"],
                            "error": f"motor: {e_motor} | pymongo: {e_pymongo}",
                        },
                        ensure_ascii=False,
                    )
                )
                return 2

        print(json.dumps({"ok": True, "impl": impl, "reply": res}, ensure_ascii=False))
        return 0
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())