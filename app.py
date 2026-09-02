import os
import subprocess
import urllib.request
import tarfile
import sys
import time

import spaces

@spaces.GPU
def dummy_gpu_function():
    # This is just a dummy function to satisfy Hugging Face's ZeroGPU requirement
    # so it doesn't kill our Node.js server!
    pass

# We call it once at startup just in case it needs to be executed to register
dummy_gpu_function()

# Define constants
NODE_VERSION = "v20.11.1"
NODE_URL = f"https://nodejs.org/dist/{NODE_VERSION}/node-{NODE_VERSION}-linux-x64.tar.xz"
NODE_DIR = os.path.join(os.getcwd(), "node-bin")
CADDY_URL = "https://github.com/caddyserver/caddy/releases/download/v2.7.6/caddy_2.7.6_linux_amd64.tar.gz"
CADDY_DIR = os.path.join(os.getcwd(), "caddy-bin")

def run_cmd(cmd):
    print(f"Executing: {cmd}")
    subprocess.run(cmd, shell=True, check=True)

def setup_node():
    if not os.path.exists(NODE_DIR):
        print(f"Downloading Node.js {NODE_VERSION}...")
        urllib.request.urlretrieve(NODE_URL, "node.tar.xz")
        print("Extracting Node.js...")
        os.makedirs(NODE_DIR, exist_ok=True)
        run_cmd(f"tar -xf node.tar.xz -C {NODE_DIR} --strip-components=1")
        if os.path.exists("node.tar.xz"):
            os.remove("node.tar.xz")
    
    # Add Node to PATH
    os.environ["PATH"] = f"{os.path.join(NODE_DIR, 'bin')}:{os.environ.get('PATH', '')}"
    print(f"Node installed. Version:")
    run_cmd("node -v")

def setup_caddy():
    if not os.path.exists(CADDY_DIR):
        print("Downloading Caddy...")
        urllib.request.urlretrieve(CADDY_URL, "caddy.tar.gz")
        print("Extracting Caddy...")
        os.makedirs(CADDY_DIR, exist_ok=True)
        run_cmd(f"tar -xf caddy.tar.gz -C {CADDY_DIR}")
        if os.path.exists("caddy.tar.gz"):
            os.remove("caddy.tar.gz")
    
    # Add Caddy to PATH
    os.environ["PATH"] = f"{CADDY_DIR}:{os.environ.get('PATH', '')}"
    print("Caddy installed. Version:")
    run_cmd("caddy version")

def build_and_start():
    print("Installing dependencies...")
    run_cmd("npm ci")
    
    print("Installing PM2...")
    run_cmd("npm install -g pm2")
    
    print("Generating Prisma client...")
    run_cmd("cd apps/api && npx prisma generate")
    
    print("Building backend (NestJS)...")
    run_cmd("npm run build --workspace=apps/api")
    
    print("Building frontend (Next.js)...")
    run_cmd("npm run build --workspace=apps/web")
    
    print("Making startup script executable...")
    run_cmd("chmod +x start_hf.sh")
    
    print("Starting application...")
    # This process needs to block forever so the HF Space stays "Running"
    subprocess.run("./start_hf.sh", shell=True)

if __name__ == "__main__":
    print("Starting Gradio Hijack Script...")
    setup_node()
    setup_caddy()
    build_and_start()
