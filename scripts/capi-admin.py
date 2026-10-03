#!/usr/bin/env python3
"""Command-line administration for a CAPI deployment."""

import argparse
import getpass
import json
import os
import sys
import urllib.error
import urllib.request
from http.cookiejar import CookieJar


DEFAULT_URL = "https://capi.jisuhudong.com"


class CAPIError(Exception):
    pass


class Client:
    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )
        self.request("POST", "/api/auth/login", {"email": email, "password": password})

    def request(self, method: str, path: str, payload=None):
        data = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            self.base_url + path, data=data, headers=headers, method=method
        )
        try:
            with self.opener.open(request) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                body = json.loads(raw)
                message = body.get("error", {}).get("message", raw.decode())
            except (ValueError, UnicodeDecodeError):
                message = raw.decode(errors="replace")
            raise CAPIError(f"HTTP {error.code}: {message}") from error
        except urllib.error.URLError as error:
            raise CAPIError(f"request failed: {error.reason}") from error
        try:
            return json.loads(raw)
        except ValueError as error:
            raise CAPIError("server returned invalid JSON") from error

    def users(self):
        return self.request("GET", "/api/admin/users")["data"]

    def update(self, user_id: str, patch):
        return self.request("PATCH", f"/api/admin/users/{user_id}", patch)


def find_user(users, email: str):
    matches = [user for user in users if user["email"].lower() == email.lower()]
    if not matches:
        raise CAPIError(f"user not found: {email}")
    return matches[0]


def print_users(users):
    for user in users:
        print(
            f'{user["email"]}\t{user["role"]}\t'
            f'{user["name"]}\t{user["balance"]:.2f}'
        )


def password_from_environment():
    password = os.environ.get("CAPI_ADMIN_PASSWORD")
    if password:
        return password
    return getpass.getpass("Admin password: ")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--url",
        default=os.environ.get("CAPI_URL", DEFAULT_URL),
        help="CAPI base URL (default: %(default)s)",
    )
    parser.add_argument(
        "--admin-email",
        default=os.environ.get("CAPI_ADMIN_EMAIL", "admin@capi.run"),
        help="existing administrator email (default: %(default)s)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("list", help="list users")

    role = subparsers.add_parser("set-role", help="set a user's role")
    role.add_argument("email")
    role.add_argument("role", choices=("user", "admin"))

    balance = subparsers.add_parser("set-balance", help="set a user's balance")
    balance.add_argument("email")
    balance.add_argument("amount", type=float)

    args = parser.parse_args()
    if args.command == "set-balance" and args.amount < 0:
        parser.error("amount must be non-negative")

    try:
        client = Client(args.url, args.admin_email, password_from_environment())
        users = client.users()
        if args.command == "list":
            print_users(users)
            return 0

        user = find_user(users, args.email)
        if args.command == "set-role":
            result = client.update(user["id"], {"role": args.role})
            print(f'{args.email}: role set to {args.role} ({result.get("updated", True)})')
        else:
            result = client.update(user["id"], {"balance": args.amount})
            print(f'{args.email}: balance set to {args.amount:.6f} ({result.get("updated", True)})')
        return 0
    except CAPIError as error:
        print(f"capi-admin: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
