#!/usr/bin/env python3
"""Push z-store repo to GitHub"""
import subprocess, os, sys

with open(os.path.expanduser('~/tmp/gh_token.txt')) as f:
    token = f.read().strip()
print("Token: " + token[:10] + "..." + token[-4:])

subprocess.call(['rm', '-rf', os.path.expanduser('~/.git-credentials')])

home = os.path.expanduser('~')
with open(home + '/.git-credentials', 'w') as f:
    f.write('https://' + token + ':x-oauth-basic@github.com\n')
os.chmod(home + '/.git-credentials', 0o600)
print("Credentials written")

subprocess.call(['git', 'config', '--global', 'credential.helper', 'store'])
subprocess.call(['git', 'config', '--global', 'user.email', 'zcusgt@gmail.com'])
subprocess.call(['git', 'config', '--global', 'user.name', 'Z Store Dev'])

os.chdir(home + '/z-store')
subprocess.call(['git', 'remote', 'remove', 'origin'])
subprocess.call(['git', 'remote', 'add', 'origin', 'https://' + token + '@github.com/zcuss/z-store.git'])

print("=== Pushing ===")
p = subprocess.Popen(['git', 'push', '-u', 'origin', 'main'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
out, _ = p.communicate()
print(out.decode())
print("Exit:", p.returncode)
