import os
import sys
import time
from pyngrok import ngrok, conf

def start_tunnel():
    # Fetch authtoken
    env_path = os.path.join("backend", ".env")
    authtoken = ""
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("NGROK_AUTHTOKEN="):
                    authtoken = line.split("=")[1].strip()
                    
    if authtoken:
        conf.get_default().auth_token = authtoken
        
    try:
        # Start ngrok on port 5173
        public_url = ngrok.connect(5173, bind_tls=True).public_url
        print(f"URL:{public_url}", flush=True)
        
        # Keep process alive
        while True:
            time.sleep(1)
    except Exception as e:
        print(f"ERROR:{e}")
        sys.exit(1)

if __name__ == "__main__":
    start_tunnel()
