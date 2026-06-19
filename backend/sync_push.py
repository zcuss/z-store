#!/usr/bin/env python3
"""Sync live files, commit, and push to GitHub"""
import subprocess, os

# Read token
home = os.path.expanduser('~')
with open(f'{home}/tmp/gh_token.txt') as f:
    token = f.read().strip()

# Sync live files
subprocess.run(['rm', '-rf', f'{home}/z-store/frontend/shop'])
subprocess.run(['cp', '-r', f'{home}/public_html/shop/.', f'{home}/z-store/frontend/shop/'])
subprocess.run(['cp', '-f', f'{home}/public_html/robots.txt', f'{home}/z-store/'])
subprocess.run(['cp', '-f', f'{home}/public_html/sitemap.xml', f'{home}/z-store/'])
subprocess.run(['cp', '-f', f'{home}/shop-app/server.js', f'{home}/z-store/backend/'])
subprocess.run(['cp', '-f', f'{home}/shop-app/package.json', f'{home}/z-store/backend/'])

# Generate fresh DB schema
subprocess.run(
    'mysqldump --no-data -u zcuss_zshop -p"ZcusShop2026!Db" zcuss_zshop > ~/z-store/database/01-initial.sql',
    shell=True, check=False
)

# Commit
os.chdir(f'{home}/z-store')
subprocess.run(['git', 'config', '--global', 'credential.helper', 'store'])
subprocess.run(['git', 'add', '-A'])
r = subprocess.run(['git', 'diff', '--cached', '--quiet'])
if r.returncode == 0:
    print("No changes to commit")
    exit(0)

# Set commit message
import sys
msg = sys.argv[1] if len(sys.argv) > 1 else "Auto-update from cPanel"
subprocess.run(['git', 'commit', '-m', msg])

# Push
subprocess.run(['git', 'push', 'origin', 'main'])
print("=== Pushed ===")
