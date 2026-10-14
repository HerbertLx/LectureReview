# LectureReview

本地 PDF 课件阅读工具：原课件在左上、翻译在左下、解释在右侧。可以拖动分隔线调整阅读区域，并使用带历史记录的悬浮问答。

## 功能

- 自主上传 **PDF**，支持课程分组、课件名称和页码目录。
- 本地生成页面截图、全文文字和分栏信息，上传不调用模型。
- 手动生成翻译、解释与大纲，保存后重复浏览不再生成。
- 支持逐页、分章节和全文批量生成缺失内容。
- 解释与问答结合整讲文字和当前页截图；问答还使用该页已有翻译、解释及最近对话。
- Markdown 与 KaTeX 公式渲染。前端资源在本地，无需运行时 CDN。
- 提示词设置和本机 API Token 替换。

## 环境与启动

需要 Python 3.10+。Windows 为主要验证环境，PDF 导入不依赖 PowerPoint。

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python server.py --port 8767
```

打开 <http://127.0.0.1:8767/>，点击左上角 **＋** 上传 PDF。初次启动不需要学校课件、账号或 API Token；只有生成和问答功能需要 Token。

macOS/Linux 可使用 `.venv/bin/python` 替代 `.venv\Scripts\python`。

### API Token

在电脑本机页面的 ⚙ 设置里配置，默认保存在 `.secrets/deepseek.txt`。也可在启动前设置 `DEEPSEEK_KEY_FILE` 指向自有密钥文件；本项目不自动读取 `.env`。

```powershell
$env:DEEPSEEK_KEY_FILE = 'E:\your-private-keys\deepseek.txt'
.venv\Scripts\python server.py --port 8767
```

Token 不返回浏览器，不传入模型上下文，不写入仓库。密钥文件是本机明文文件，请保护其访问权限。模型固定 `deepseek-flash`，关闭 thinking；生成和提问会产生供应商 API 费用，保存设置和上传不会。

## 数据与隐私

| 位置 | 用途 |
| --- | --- |
| `dist/` | 共用前端界面与本地第三方资源 |
| `server.py` | HTTP 服务、生成接口、设置和问答 |
| `uploads.py` | PDF 检查、导入、课件列表和阅读服务恢复 |
| `extract_layout.py` | PDF 文字分栏提取 |
| `uploaded-decks/` | 上传原文、截图、文字、生成缓存和问答历史，全部忽略 |
| `data/` | 本地提示词设置等运行状态，全部忽略 |
| `.secrets/` | 本机密钥，全部忽略 |

本仓库不包含学校课件、学生名单、生成讲解、问答历史或任何密钥。每份上传使用独立 ID，同名上传不覆盖旧课件。

仅接受 PDF，最大60MB、300页。加密 PDF 不支持；扫描版没有 OCR，文字提取可能为空，但截图仍可阅读。讲解是 AI 辅助材料，请核对老师课件。

## 局域网与服务

基础服务默认使用8767端口。上传课件在8780–8899范围分配独立端口，基础服务下次启动时恢复已导入课件的阅读服务。电脑需保持运行，其他设备可通过 `http://电脑局域网IP:端口/` 访问。

**仅用于本机或可信局域网。当前没有登录认证或 HTTPS，不要暴露到公网。** 同一局域网的用户可能查看资料或调用生成接口。Token 修改仅允许 localhost；普通 HTTP 上传与提问不提供传输加密。防火墙开放端口需由使用者自行决定。

## 测试

```powershell
.venv\Scripts\python -m unittest test_cache test_uploads
```

测试使用临时数据和模拟模型，不读取真实密钥，也不调用付费模型。PDF 导入测试使用自动生成的无个人信息样例。

`ci-tests.example.yml` 提供 GitHub Actions 配置示例。若需要启用自动测试，可使用有相应权限的账号将其放到 `.github/workflows/tests.yml`；当前发布不依赖 workflow 权限。

## 第三方组件

KaTeX、Marked、DOMPurify 随代码提供，许可证见 `THIRD_PARTY_NOTICES.md` 及各组件目录。PyMuPDF 的许可证条件与项目自身代码分开，请查阅上游条款。
