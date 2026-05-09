import subprocess
import os
import sys
import time
import threading
import urllib.request
import json

def update_env_and_config(url):
    print(f"\n[+] Tunnel created! Public URL: {url}")
    # Update .env
    env_path = os.path.join("backend", ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            content = f.read()
        if "WEBAPP_URL=" in content:
            lines = [f"WEBAPP_URL={url}" if line.startswith("WEBAPP_URL=") else line for line in content.split("\n")]
            content = "\n".join(lines)
        else:
            content += f"\nWEBAPP_URL={url}\n"
        with open(env_path, "w", encoding="utf-8") as f:
            f.write(content)
            
    # Update config.py
    config_path = os.path.join("backend", "app", "config.py")
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            content = f.read()
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if line.strip().startswith("WEBAPP_URL: str ="):
                lines[i] = f'    WEBAPP_URL: str = "{url}"'
        with open(config_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))
            
    # Update frontend .env.local
    frontend_env = ".env.local"
    with open(frontend_env, "w", encoding="utf-8") as f:
        f.write('VITE_API_URL=""\n')
        
    print("[+] Configuration updated with new URL.")

def run_process(cmd, cwd, prefix):
    # Use shell=True for npm/npx on Windows
    process = subprocess.Popen(cmd, cwd=cwd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    return process

def tail_logs(process, prefix):
    for line in process.stdout:
        # ngrok prints a lot of TUI junk to stdout, we can filter or just print
        if prefix != "TUNNEL":
            print(f"[{prefix}] {line.strip()}")

def main():
    processes = []
    
    print("=========================================")
    print("  🚀 Starting BFU Unified Environment")
    print("=========================================\n")

    # 1. Fetch ngrok authtoken
    env_path = os.path.join("backend", ".env")
    authtoken = ""
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("NGROK_AUTHTOKEN="):
                    authtoken = line.split("=")[1].strip()

    # 2. Start ngrok via python script to reliably get URL
    print("[*] Starting ngrok...")
    cmd = ".venv\\Scripts\\python.exe tunnel.py"
    ngrok_proc = run_process(cmd, os.getcwd(), "TUNNEL")
    processes.append(ngrok_proc)
    
    url = None
    print("[*] Waiting for ngrok tunnel to become available...")
    for line in ngrok_proc.stdout:
        if line.startswith("URL:"):
            url = line.split("URL:")[1].strip()
            break
        elif line.startswith("ERROR:"):
            print(f"[-] Ngrok failed: {line}")
            break
        print(f"[TUNNEL] {line.strip()}")
            
    if not url:
        print("[-] Failed to start ngrok. Check if the authtoken is valid.")
        ngrok_proc.terminate()
        sys.exit(1)
        
    threading.Thread(target=tail_logs, args=(ngrok_proc, "TUNNEL"), daemon=True).start()

    # 3. Update Environment
    update_env_and_config(url)

    # (Database Seeder removed due to Python Windows pipe inheritance deadlock)

    # 5. Start Vite Frontend (Port 5173)
    print("\n[*] Starting React Frontend...")
    frontend_proc = run_process("npm run dev", os.getcwd(), "REACT")
    processes.append(frontend_proc)
    threading.Thread(target=tail_logs, args=(frontend_proc, "REACT"), daemon=True).start()

    # 5. Start FastAPI Backend (Port 8000)
    print("[*] Starting FastAPI Backend...")
    # Use the venv python
    backend_proc = run_process("..\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --reload --port 8000", os.path.join(os.getcwd(), "backend"), "FASTAPI")
    processes.append(backend_proc)
    threading.Thread(target=tail_logs, args=(backend_proc, "FASTAPI"), daemon=True).start()

    # 6. Start Telegram Bot Launcher
    time.sleep(1)
    print("[*] Starting Telegram Bot...")
    bot_proc = run_process("..\\.venv\\Scripts\\python.exe bot.py", os.path.join(os.getcwd(), "backend"), "BOT")
    processes.append(bot_proc)
    threading.Thread(target=tail_logs, args=(bot_proc, "BOT"), daemon=True).start()

    print("\n=========================================")
    print("  ✅ All services are running!")
    print(f"  🌐 WebApp URL: {url}")
    print("  Press Ctrl+C to stop everything.")
    print("=========================================\n")

    try:
        # Keep main thread alive
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Shutting down all services...")
        for p in processes:
            p.terminate()
        print("[-] Goodbye!")

if __name__ == "__main__":
    main()
