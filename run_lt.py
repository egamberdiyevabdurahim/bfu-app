import subprocess
import os

print("Starting localtunnel...")
# Run localtunnel
process = subprocess.Popen(["npx.cmd", "--yes", "localtunnel", "--port", "5173"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

url = None
# Read the first line of output which should contain the URL
for line in process.stdout:
    print(line)
    if "your url is:" in line:
        url = line.split("your url is:")[1].strip()
        break

if url:
    print(f"Found URL: {url}")
    # Update config and .env
    env_path = os.path.join("backend", ".env")
    with open(env_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "WEBAPP_URL=" in content:
        lines = content.split("\n")
        lines = [f"WEBAPP_URL={url}" if line.startswith("WEBAPP_URL=") else line for line in lines]
        content = "\n".join(lines)
    else:
        content += f"\nWEBAPP_URL={url}\n"
        
    with open(env_path, "w", encoding="utf-8") as f:
        f.write(content)
        
    config_path = os.path.join("backend", "app", "config.py")
    with open(config_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    lines = content.split("\n")
    for i, line in enumerate(lines):
        if line.strip().startswith("WEBAPP_URL: str ="):
            lines[i] = f'    WEBAPP_URL: str = "{url}"'
            
    with open(config_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
        
    print("Successfully updated .env and config.py with the new URL!")
else:
    print("Failed to get URL from localtunnel.")

# Keep the process running so the tunnel stays open
try:
    process.wait()
except KeyboardInterrupt:
    process.terminate()
