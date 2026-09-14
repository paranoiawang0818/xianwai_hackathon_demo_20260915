# 备用观点分析接口

内容获取保持使用知乎搜索 API。仅将本次取得的文章／回答标题、作者和摘录发送到你配置的模型平台，要求按相同规则输出关键词、观点和原句；不开启其联网搜索。知乎凭证不会传给模型平台。

## 第一步：上传代码

解压 `xianwai-backup-analysis-20260915.zip`，在 GitHub 仓库根目录选择 Add file → Upload files，拖入解压文件夹**里面**的 dist、scripts、prompts、tests 等文件夹和文件，然后提交。不要上传 ZIP 或最外层文件夹。

此包包含前一次修复所需的文件，但不含 `scripts/serve.mjs`，保留你已经改好的 Render 监听设置。不要删除仓库中的其他文件。等待 Render 自动部署；若未自动部署，选择 Manual Deploy → Deploy latest commit。

## 第二步：在 Render 配置分析平台

打开这个服务的 Environment，添加以下变量。两家选一家即可，无需把密钥发到聊天或 GitHub。示例使用官方普通推理 API；模型需要在你的账号中可用。模型调用费用与额度由该平台计收，Render 免费套餐与模型 API 计费互相独立。

| 变量 | 智谱示例 | Kimi 国内平台示例 |
|---|---|---|
| `ANALYSIS_BACKUP_PROVIDER` | `zhipu` | `kimi` |
| `ANALYSIS_BACKUP_API_KEY` | 你自己的智谱 API Key | 你自己的 Kimi API Key |
| `ANALYSIS_BACKUP_MODEL` | `glm-4.7` | `kimi-k2.5` |
| `ANALYSIS_STRATEGY` | `backup-only` | `backup-only` |
| `ANALYSIS_BACKUP_THINKING` | `disabled` | `disabled` |

保存并重新部署。原来的 `ZHIHU_ACCESS_SECRET`、构建命令和启动命令保留。上述思考参数用于这两个示例模型；更换其他模型时应按该平台支持情况调整或删除此变量。

`backup-only` 只跳过知乎的**分析**，知乎搜索照常运行。当前知乎直答超时时，建议使用这个设置，避免先等待知乎。

官方接口与示例参考：[智谱 GLM-4.7](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)、[Kimi API](https://platform.kimi.com/docs/api/chat)、[Kimi K2.5 官方示例](https://github.com/MoonshotAI/Kimi-K2.5)。模型名称为可配置项，不会根据平台自动变化。

## 第三步：测试一首歌曲

刷新弦外，搜索《勾指起誓》。若有“观点分析尚未完成”的旧缓存，进入后点击“重新分析已有材料”，无需重新检索。如果 Render 重部署清除了临时文件，则正常搜索一次。

成功后会生成歌墙。打开词语、加入两个词并比较，应看到 `AI 概括`，并能展开原句和知乎来源。页面不显示分析平台名称；平台、模型和完成时间仅保留在服务端缓存，方便维护者排错。

没有足够的真实论述、无效密钥、额度不足、网络失败、输出截断或证据校验不通过时仍会明确显示失败，不为凑完整页面编造观点。“本次状态”展示错误码，具体平台尝试记录只保存在后台。

## 其他策略与兼容平台

- `zhihu-first`（默认）：知乎先分析；配置了备用平台时默认等知乎最多 25 秒，失败或校验不通过后改用备用平台。
- `backup-first`：备用平台先分析，失败后尝试知乎。
- `backup-only`：只调用备用平台分析；适合当前情况。

每个配置的提供方每次任务最多调用一次，取消后不再切换；已成功缓存的歌曲不重复调用。自动切换可能消耗两边的调用额度。

其他兼容 OpenAI Chat Completions 的平台可配置 `ANALYSIS_BACKUP_PROVIDER=compatible`，再设置 `ANALYSIS_BACKUP_BASE_URL`、`ANALYSIS_BACKUP_MODEL` 和 `ANALYSIS_BACKUP_API_KEY`。Base URL 是 HTTPS API 根路径，不包括末尾 `/chat/completions`；例如 Kimi 国内为 `https://api.moonshot.cn/v1`，国际为 `https://api.moonshot.ai/v1`，应使用对应地区的账号密钥。智谱默认为 `https://open.bigmodel.cn/api/paas/v4`。

可选：`ANALYSIS_BACKUP_TIMEOUT_MS` 默认 120000；`ANALYSIS_ZHIHU_TIMEOUT_MS` 无备用时默认 100000、有备用时默认 25000；`ANALYSIS_BACKUP_MAX_TOKENS` 默认 12000；`ANALYSIS_BACKUP_THINKING` 默认 `default`（不传此字段）。不要在 Base URL 中放密钥。配置只能来自服务端环境变量，网页请求不能指定地址或凭证。

本地 Node 服务读取进程环境变量，不自动读取 `.env`。配置文件不会被静态服务公开。研究原始文本与密钥均不写入浏览器响应；浏览器只读取必要证据和分析出处。

常见配置错误：`AUTH_FAILED` 检查密钥及平台地区；`INVALID_REQUEST` 检查模型名称及是否支持所填思考参数；`NOT_FOUND` 检查 API 根地址和模型；`BILLING_ERROR` 检查模型账号余额；`RATE_LIMITED` 检查额度或频率。不要把这些问题当作知乎没有材料。

## 验证范围

已使用项目真实资料作为固定测试样本，验证官方地址、各自密钥隔离、超时覆盖响应正文、取消不切换、失败后切换、证据校验失败切换、两边失败保留来源、缓存复用和分析平台标记。

没有配置或调用你的智谱/Kimi 真实密钥。本次测试验证接入实现和交互，不等于已验证这些平台当前可用，也不能保证每首歌有足够材料。上传并配置后的一次真实查询仍是必要验收。

本轮 `npm test` 20 项测试、`npm run validate`、`git diff --check` 均通过。浏览器已用真实资料固定样本走通：待分析来源 → 重试 → 知乎失败后备用结果通过校验 → 歌墙详情 → 两词对比 → 展开原句。页面只有 AI 概括标签，不含平台名称；原始知乎链接保留，控制台没有错误。
