"""Start or reuse this checkout without stopping unrelated services."""
import argparse
import hashlib
import json
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
ROOT=Path(__file__).resolve().parent

def instance_id(root=ROOT):
    return hashlib.sha256(str(root.resolve()).encode('utf-8')).hexdigest()[:16]

def health(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health',timeout=.6) as response:return json.load(response)
    except (OSError,ValueError,urllib.error.URLError):return None

def is_own_service(value):
    return isinstance(value,dict) and value.get('product')=='LectureReview' and value.get('instance')==instance_id()

def choose_port(preferred):
    for port in range(preferred,min(preferred+20,65536)):
        if is_own_service(health(port)):return port,True
        with socket.socket() as probe:
            if sys.platform=='win32':probe.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
            try:probe.bind(('0.0.0.0',port));return port,False
            except OSError:continue
    raise RuntimeError('附近20个端口均被占用，请使用 start.bat -Port 其他端口。')

def lan_address():
    try:
        # Choose the outbound interface without sending packets.
        with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as probe:
            probe.connect(('192.0.2.1',80));return probe.getsockname()[0]
    except OSError:return None

def main():
    parser=argparse.ArgumentParser(description='LectureReview 一键启动')
    parser.add_argument('--port',type=int,default=8767)
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    if not 1024<=args.port<=65535:parser.error('端口必须为1024–65535')
    process=None
    try:
        port,reused=choose_port(args.port);url=f'http://127.0.0.1:{port}/'
        if not reused:
            process=subprocess.Popen([sys.executable,'-u',str(ROOT/'server.py'),'--port',str(port)],cwd=ROOT)
            deadline=time.monotonic()+30
            while time.monotonic()<deadline:
                if process.poll() is not None:raise RuntimeError('服务启动失败，请查看上面的错误信息。')
                if is_own_service(health(port)):break
                time.sleep(.2)
            else:raise RuntimeError('等待服务启动超时，请检查网络和端口。')
        print('\nLectureReview 已就绪',flush=True);print('电脑网址：'+url,flush=True)
        address=lan_address()
        if address:print(f'同一局域网： http://{address}:{port}/ （需要自行允许防火墙访问）',flush=True)
        if port!=args.port:print(f'原端口已被占用，自动使用 {port}，未停止其他程序。',flush=True)
        if not args.no_browser:webbrowser.open(url)
        if reused:print('已复用本项目正在运行的服务，无需重复启动。',flush=True);return 0
        print('首次使用：点击＋上传 PDF；需要 AI 时在电脑本机⚙设置 Token。',flush=True)
        print('请保持电脑运行。按 Ctrl+C 可停止本次启动的入口服务。\n',flush=True)
        return process.wait()
    except KeyboardInterrupt:print('\n正在停止入口服务…',flush=True);return 0
    except Exception as error:print('启动失败：'+str(error),file=sys.stderr);return 1
    finally:
        if process and process.poll() is None:
            process.terminate()
            try:process.wait(timeout=5)
            except subprocess.TimeoutExpired:process.kill();process.wait()

if __name__=='__main__':sys.exit(main())
