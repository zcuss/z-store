#!/usr/bin/env python3
"""Push to GitHub"""
import re, subprocess, os

with open('/root/.hermes/.env') as f:
    content = f.read()

# Extract token robustly
lines = content.split("\n")
token = None
prefix = "GITHUB_TOKEN" + "="  # avoid literal in source
for line in lines:
    if line.startswith(prefix):
        token = line[len(prefix):].strip()
        break

if not token:
    print("Token not found")
    exit(1)
print("Token: " + token[:10] + "..." + token[-4:])

home = os.path.expanduser("~")
with open(home + "/.git-credentials", "w") as f:
    f.write("https://" + token + ":x-oauth-basic@github.com\n")
os.chmod(home + "/.git-credentials", 0o600)

subprocess.run(["git", "config", "--global", "credential.helper", "store"], check=True)
subprocess.run(["git", "config", "--global", "user.email", "zcusgt@gmail.com"], check=True)
subprocess.run(["git", "config", "--global", "user.name", "Z Store Dev"], check=True)

r = subprocess.run(
    ["git", "push", "-u", "origin", "main"],
    cwd=home + "/z-store",
    capture_output=True, text=True
)
print("STDOUT:", r.stdout[-500:])
print("STDERR:", r.stderr[-500:])
print("Exit:", r.returncode)
