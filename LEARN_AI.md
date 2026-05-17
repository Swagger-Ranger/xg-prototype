# `qicheng-ai` 前置学习手册（Java 老兵 → AI Sidecar）

> 读者画像：7-8 年 Java 经验、数学功底好、Python 不熟、AI 框架是新世界。
> 目标：**两到三周内**，把对话、RAG、Agent、MCP、可观测全部"摸一遍"，让你对着我们 `ai/` 目录里那几个空文件 `app/llm`、`app/rag`、`app/agents`、`app/graph` 不再发怵。
>
> 学习信条：**读 → 抄 → 改 → 搬**。先把别人能跑的项目克隆下来跑通，理解输入输出与目录结构，然后把对应那一小段代码"翻译"到 `qicheng-ai`。**不要从零写**，没意义。

> **配套学习沙箱已生成**：`~/labs/learn-ai/`（与本仓**完全隔离**，自带 docker-compose 起 pgvector，含 4 个 Phase 的起手骨架）。
> 进入沙箱：`cd ~/labs/learn-ai && cat README.md` 按里面的"环境准备"章节走一遍。

---

## 0. 你需要建立的认知地图

```
┌─────────────────────────────────────────────────────────┐
│              用户/前端 (web / miniapp)                   │
└──────────────┬───────────────────┬──────────────────────┘
               │ /api              │ /api/ai (代理)
               ▼                   ▼
        ┌────────────┐      ┌──────────────────┐
        │ Java 后端   │◀────▶│  Python AI       │
        │ Spring     │ MCP  │  FastAPI +       │
        │ Boot       │ HTTP │  LangGraph       │
        └─────┬──────┘      └─────┬────────────┘
              │业务/事务           │
              ▼                   ▼
        ┌────────────┐     ┌──────────────────┐
        │ PostgreSQL │     │ One-API (LLM网关) │
        │ + pgvector │◀────│ Langfuse (追踪)   │
        └────────────┘     └──────────────────┘
```

**一句话总结你 AI 模块要干的活**：

1. **对话**（chat）：接前端的消息，转给 LLM，把流式回复推回去。
2. **RAG**（知识库问答）：把校规、规章、FAQ、辅导员经验切片向量化存到 pgvector，用户提问时先检索再生成。
3. **Agent**（规划调度）：用 LangGraph 编排"理解意图 → 调用 Java 提供的 MCP Tool → 输出结构化结果"的多步骤推理（如"帮 5 个学生发助学金通知"）。
4. **MCP 客户端**：Tool 都暴露在 Java 那边，AI 这边只是用 MCP 协议发 RPC。
5. **可观测**：每一次 LLM 调用、每一段 prompt、每一次工具调用，都进 Langfuse 看得到。

下面的学习路径就是按这五个能力组织的。

---

## 1. 总学习路径（约 12-18 个学习日，每日 2-3h）

| 阶段 | 主题 | 时长 | 你做完能交付什么 |
| --- | --- | --- | --- |
| Phase 0 | Python 速通 + FastAPI 入门 | 2-3 天 | `ai/app/main.py` 能跑、能加路由、看得懂 async |
| Phase 1 | LLM 网关 + 对话基础 | 1-2 天 | 自己用 OpenAI SDK 调通 One-API，写出第一版流式 `/chat` |
| Phase 2 | RAG 完整链路 | 3-5 天 | 用 pgvector 做了一个最小知识库 demo，能讲清 chunk/embedding/retrieval/rerank |
| Phase 3 | LangGraph + Tool + MCP | 3-5 天 | 用 LangGraph 写出一个能调 Tool 的 Agent，并接通 Java MCP Server |
| Phase 4 | 可观测 + 工程化 | 1-2 天 | Langfuse 自托管，看到 trace 树 |
| Phase 5 | 搬到 `qicheng-ai` | 2-3 天 | 在我们仓库里跑通对话 + RAG + Agent 三个端到端 demo |

> **重要**：第一遍不要追求理解所有细节，先把每个项目都"跑起来 + 改一行 + 重启看到效果"。AI 框架的概念只有在你跑过几次后才会有手感。

---

## Phase 0：Python + FastAPI 速通（2-3 天）

### 0.1 Java 老兵的 Python 速查表

| Java | Python 等价物 | 备注 |
| --- | --- | --- |
| `class Foo {}` | `class Foo:` | 没有大括号，靠缩进（**4 空格**，不是 2） |
| `void` | `-> None` | 类型提示是后缀 |
| `Optional<String>` | `str \| None` 或 `Optional[str]` | Python 3.10+ 推荐前者 |
| `List<String>` | `list[str]` | 小写 `list` |
| `Map<String, Object>` | `dict[str, Any]` | |
| `final` | 没有，约定大写 `MAX_RETRY = 3` | 想严格用 `typing.Final` |
| `@Bean / @Service` | 没有 IoC，**直接 import**或用 FastAPI 的 `Depends()` | |
| `Lombok @Data` | `@dataclass` 或 `pydantic.BaseModel` | API 层用 Pydantic |
| `Maven pom.xml` | `pyproject.toml` | 我们用 `uv` 管理 |
| `Spring Boot` | `FastAPI` | 思路相似：装饰器 = 注解 |
| `CompletableFuture` | `async def` + `await` | 一定要 `async`，FastAPI 全异步 |
| `Stream.map().filter()` | 列表推导 `[f(x) for x in xs if g(x)]` | |
| `try { } catch (E e) {}` | `try: ... except E as e: ...` | |
| `slf4j Logger` | `logging.getLogger(__name__)` | |
| `@Test` | `def test_xxx():` (pytest) | 函数名以 `test_` 开头 |
| `null` | `None` | |
| `Iterable.forEach` | `for x in xs: ...` | |

**速通建议**：

- 不要看完整本《Python 教程》。直接挑会的概念翻一下：模块/包、装饰器、生成器、`async`/`await`、上下文管理器（`with`）、type hint。
- 推荐资料（任挑一份，半天搞定）：
  - 官方教程速读：<https://docs.python.org/zh-cn/3/tutorial/index.html>（看完前 9 章 OK）
  - Real Python 的 _Python for Java Developers_：<https://realpython.com/python-vs-java/>
  - 廖雪峰 Python：<https://liaoxuefeng.com/books/python/>（中文版，约 4-6h 读完核心）

### 0.2 FastAPI 30 分钟入门

> 把 FastAPI 当 Spring Boot Reactive 来理解：路由 = `@RestController`，依赖注入 = `Depends`，DTO = Pydantic。

**官方教程（这一份就够了）**：<https://fastapi.tiangolo.com/zh/tutorial/>

最少要看：

1. _First Steps_、_Path Parameters_、_Query Parameters_
2. _Request Body_（Pydantic 模型）
3. _Dependencies_（`Depends`）
4. _Async Concurrency_

**动手练习**：

```bash
cd ai
uv sync --all-groups
uv run uvicorn app.main:app --reload --port 8001
# 浏览器打开 http://127.0.0.1:8001/docs（Swagger），http://127.0.0.1:8001/redoc
```

然后挑战自己：在 `app/api/` 下加一个 `echo.py`，实现 `POST /api/v1/echo`，请求体是 `{"text": "..."}`，返回 `{"echo": "...", "length": N}`。**不会就先抄 `chat.py`，照着改**。

### 0.3 项目级参考：FastAPI Full-Stack Template ⭐ 必看

> 不是用来抄业务代码，而是看一个**生产级 FastAPI 工程**长什么样：目录、配置、迁移、Docker、CI。

- GitHub：<https://github.com/fastapi/full-stack-fastapi-template>（42K stars，2026.1 release v0.10.0，活跃维护）
- 启动方式（macOS）：

```bash
git clone https://github.com/fastapi/full-stack-fastapi-template ~/labs/fastapi-template
cd ~/labs/fastapi-template
cp .env.example .env
# 改 .env 里的 SECRET_KEY 与 POSTGRES_PASSWORD
docker compose watch
# 浏览器打开 http://localhost:8000/docs（API） http://localhost:5173（前端）
```

**重点观察**：

- `backend/app/api/`、`backend/app/core/config.py`、`backend/app/models.py`、`backend/app/crud.py`：这就是我们 `ai/app` 目录的"成熟版本"。
- `Dockerfile`、`pyproject.toml`、`uv.lock`：和我们的工程化套路完全一致。

**带回 `qicheng-ai`**：

- 看完后回头审视 `ai/app/` 的目录组织，调整 `config.py`（参考 `backend/app/core/config.py` 的 `Settings` 写法）。

---

## Phase 1：LLM 网关 + 对话基础（1-2 天）

### 1.1 部署 One-API（LLM 统一网关）

> 我们项目选型用 One-API 做"OpenAI 兼容"网关，所有上游模型（DeepSeek、通义、豆包、ChatGLM…）统一成一个 API key + base URL。学完这一步，**你以后再切换模型就是改一行配置**。

- GitHub：<https://github.com/songquanpeng/one-api>（31K stars，活跃；2026 仍在迭代）
- 推荐起步用 Docker：

```bash
mkdir -p ~/labs/one-api/data ~/labs/one-api/logs
docker run --name one-api -d --restart=always \
  -p 3000:3000 \
  -e TZ=Asia/Shanghai \
  -v ~/labs/one-api/data:/data \
  -v ~/labs/one-api/logs:/var/log \
  ghcr.io/songquanpeng/one-api:latest
```

打开 <http://localhost:3000>：

1. 用默认 `root / 123456` 登录，**立刻改密码**。
2. **渠道（Channel）**：新建一个，选 `OpenAI` 或 `DeepSeek`，把你自己的上游 API key 填进去，类型选 `OpenAI`，模型选 `gpt-4o-mini` 或 `deepseek-chat`。
3. **令牌（Token）**：新建一个本地用的 token，复制出来，记作 `LOCAL_OAI_KEY`。
4. **用 curl 验证**：

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer $LOCAL_OAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [{"role":"user","content":"用一句话介绍你自己"}]
  }'
```

成功的话把这两个值写到 `ai/.env`：

```ini
ONE_API_BASE_URL=http://127.0.0.1:3000/v1
ONE_API_KEY=<你的 LOCAL_OAI_KEY>
```

### 1.2 第一个流式对话脚本

新建一个 `ai/scripts/learn_01_chat.py`（不会污染 `app/`）：

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url=os.environ["ONE_API_BASE_URL"],
    api_key=os.environ["ONE_API_KEY"],
)

stream = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "你是高校学工系统的助理，回答简洁。"},
        {"role": "user", "content": "我想申请助学金，需要哪些材料？"},
    ],
    stream=True,
)
for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

```bash
cd ai
uv add openai            # 顺手把 openai SDK 加进来
uv run python scripts/learn_01_chat.py
```

**带回 `qicheng-ai`**：在 `app/llm/openai_client.py` 用 `get_async_openai()` 封装 `AsyncOpenAI`（配置从 `app/config.py` 的 `Settings` 读）；再改 `app/api/chat.py` 调真实流式补全，而不是 stub。另见 `app/llm/client.py`（httpx）用于非 SDK 场景。

### 1.3 LangChain 官方 Quickstart

- 文档：<https://docs.langchain.com/oss/python/langchain/quickstart>
- LangChain 1.0 已 GA（2026），**全栈推荐用 LangChain v1 + LangGraph v1 配套**。

最少要懂：

- `init_chat_model("deepseek-chat", model_provider="openai", base_url=..., api_key=...)`
- `ChatPromptTemplate`、`MessagesPlaceholder`
- LCEL：`prompt | model | StrOutputParser()`（链式管道，类似 Java 的 `Function.andThen`）
- 流式 `model.stream(messages)`

写第二个练习 `scripts/learn_02_langchain.py`：用 LangChain 改写 `learn_01_chat.py`，体会一下 LCEL 的"组装感"。

### 1.4 在 `app/api/chat.py` 上做一次纵向演化（V1 → V2 → V3）

> 这一节是 1.3 的"加餐"：**接口不变**（`POST /ai/chat`，SSE 帧格式 `data: {"delta":"..."}\n\n` + `data: [DONE]`），只换内部实现，让你**亲眼看到**裸 SDK / LangChain LCEL / LangGraph 三种姿势在同一段功能上的代价与收益。
>
> 不需要立刻改 `app/`。先在 `scripts/` 下分别写 `learn_03a_v2_lcel.py`、`learn_03b_v3_graph.py` 把 V2 / V3 跑通，再决定是否回迁到 `app/api/chat.py`。

#### V1 现状：直连 OpenAI SDK（已落地）

代码就是当前仓库里的 `app/api/chat.py` + `app/llm/openai_client.py`，结构是：

```text
client = AsyncOpenAI(base_url=..., api_key=...)         # 全局单例（lru_cache）
   ↓
stream = await client.chat.completions.create(model, messages, stream=True, ...)
   ↓
async for chunk in stream:
    yield f'data: {{"delta": "{chunk.choices[0].delta.content}"}}\n\n'
yield b'data: [DONE]\n\n'
```

**特点**：

- 优点：**没有任何抽象**，最少依赖（只要 `openai` 一个包），调试简单。
- 缺点：换模型 / 加 prompt 模板 / 加历史 / 加 parser，**每次都要在生成器里手工塞**；接 RAG 或 tool 时基本要重写。

---

#### V2：换成 LCEL chain（最小 LangChain Runnable）

外壳的 `gen()` 不动、SSE 帧格式不动，只把"造数据流"这一段从 `client.chat.completions.create` 换成一条 LCEL chain。

**安装依赖**：

```bash
cd ai
uv add "langchain>=1.0" "langchain-openai>=0.3" "langchain-core>=1.0"
```

**核心改造**（伪代码，挂在 `app/api/chat.py` 的 `gen()` 内部）：

```python
from langchain.chat_models import init_chat_model
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser

def build_chain(model_name: str, temperature: float):
    model = init_chat_model(
        model_name,
        model_provider="openai",
        base_url=settings.one_api_base_url,
        api_key=settings.one_api_key,
        temperature=temperature,
    )
    prompt = ChatPromptTemplate.from_messages([
        MessagesPlaceholder("messages"),  # 直接接受 OpenAI 风格的 messages 列表
    ])
    return prompt | model | StrOutputParser()

async def gen() -> AsyncIterator[bytes]:
    chain = build_chain(model, temperature)
    try:
        async for token in chain.astream({"messages": messages}):
            if token:
                payload = json.dumps({"delta": token}, ensure_ascii=False)
                yield f"data: {payload}\n\n".encode()
        yield b"data: [DONE]\n\n"
    except Exception as e:
        err = json.dumps({"error": str(e)}, ensure_ascii=False)
        yield f"data: {err}\n\n".encode()
```

**多/少了什么**：

| 维度 | 对 V1 的变化 |
| --- | --- |
| 模型切换 | 从"传 base_url + 改 model 字符串"升级成 `init_chat_model(name, provider=...)`，**provider 改一下就能换 Anthropic / Bedrock / 本地模型** |
| Prompt | `messages` 从外部传进来；将来想加 system 模板、`MessagesPlaceholder("history")`、RAG 的 `{context}` 变量，**就是在 `ChatPromptTemplate` 里加一行**，不用碰 `gen()` |
| 输出 | `StrOutputParser` 把 `AIMessageChunk` → `str`，`gen()` 里只关心字符串 |
| 接 Langfuse | 后面只要 `chain.astream(..., config={"callbacks": [handler]})`，**一行接入 trace** |
| 代价 | 多 3 个依赖（`langchain` / `langchain-core` / `langchain-openai`），多一层 Runnable 抽象 |

**适合停在 V2 的场景**：单/多轮对话、RAG、简单 prompt 编排——**绝大多数 chat 场景到这里就够了**。

---

#### V3：再收束成 LangGraph 三节点（State + Graph）

外壳依旧不动，把"造数据流"换成一张 3 节点的图：`prepare → llm → finalize`。

**安装依赖**：

```bash
uv add "langgraph>=1.0"
```

**核心改造**（伪代码）：

```python
from typing import Annotated, TypedDict
from langchain.chat_models import init_chat_model
from langchain_core.messages import AnyMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

class ChatState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]  # reducer：自动合并新消息
    model_name: str
    temperature: float

async def prepare(state: ChatState) -> dict:
    # V3 这里几乎是空操作；将来可塞「检索 → 注入 system」「权限校验」「敏感词」
    return {}

async def call_llm(state: ChatState) -> dict:
    model = init_chat_model(
        state["model_name"],
        model_provider="openai",
        base_url=settings.one_api_base_url,
        api_key=settings.one_api_key,
        temperature=state["temperature"],
    )
    ai_msg = await model.ainvoke(state["messages"])
    return {"messages": [ai_msg]}  # reducer 自动 append 到历史

async def finalize(state: ChatState) -> dict:
    # V3 这里也几乎是空操作；将来可塞「写库」「发埋点」「敏感词二次过滤」
    return {}

def build_graph():
    g = StateGraph(ChatState)
    g.add_node("prepare", prepare)
    g.add_node("llm", call_llm)
    g.add_node("finalize", finalize)
    g.add_edge(START, "prepare")
    g.add_edge("prepare", "llm")
    g.add_edge("llm", "finalize")
    g.add_edge("finalize", END)
    return g.compile()

graph = build_graph()  # 模块级单例

async def gen() -> AsyncIterator[bytes]:
    state = {"messages": messages, "model_name": model, "temperature": temperature}
    try:
        # stream_mode="messages" 让我们按 token 拿 LLM 节点的增量输出
        async for chunk, metadata in graph.astream(state, stream_mode="messages"):
            if metadata.get("langgraph_node") != "llm":
                continue
            if chunk.content:
                payload = json.dumps({"delta": chunk.content}, ensure_ascii=False)
                yield f"data: {payload}\n\n".encode()
        yield b"data: [DONE]\n\n"
    except Exception as e:
        err = json.dumps({"error": str(e)}, ensure_ascii=False)
        yield f"data: {err}\n\n".encode()
```

**多/少了什么**：

| 维度 | 对 V2 的变化 |
| --- | --- |
| 状态 | 显式 `ChatState`，用 reducer（`add_messages`）合并消息——**多轮 / Tool 调用 / Subgraph 都靠它扩展** |
| 流程 | 用 `StateGraph` + `add_edge` 把"准备 / 调用 / 后处理"切成可插拔节点；**未来加 RAG 节点、Tool 节点、HITL 中断都不用动 LLM 节点** |
| Checkpoint | 加一行 `g.compile(checkpointer=PostgresSaver(...))`，对话**可断点续跑**（用户半路关网页，下次能恢复） |
| 流式 | 从 `chain.astream` → `graph.astream(..., stream_mode="messages")`，要按节点过滤，**接口比 V2 啰嗦一点** |
| 代价 | 多一个 `langgraph` 包；纯 chat 的 3 节点版略显"杀鸡用牛刀"——**V3 的红利只有在加分支 / 工具 / 多 Agent 后才显现** |

**适合升级到 V3 的信号**：

- 出现"理解意图 → 检索 → 调工具 → 再生成"的多步流程
- 需要"暂停等用户审批"（human-in-the-loop）
- 多个角色协作（Planner / Executor / Critic）
- 长任务要可恢复

如果只是 chat + RAG，**别急着上 V3，V2 的 LCEL 写 RAG 已经够干净**。

---

#### 一张表收束

| | V1 直连 SDK | V2 LCEL chain | V3 LangGraph 三节点 |
| --- | --- | --- | --- |
| 适用 | 早期/快速验证 | 单/多轮对话、RAG、简单工具 | 复杂 Agent、HITL、可恢复 |
| 主抽象 | `AsyncOpenAI` | `Runnable`（`prompt \| model \| parser`） | `StateGraph`（State + Node + Edge） |
| 切模型 | 改 base_url + model 字符串 | 改 `init_chat_model(name, provider=...)` | 同 V2 |
| 加 prompt 模板 | 自己拼 | `ChatPromptTemplate` 加一行 | 同 V2 |
| 加历史 / 多轮 | 手工拼 messages | `MessagesPlaceholder` | reducer 自动合并 + `checkpointer` 持久化 |
| 加 RAG | 自己塞 context | chain 中插一节 retriever | 加一个 `retrieve` 节点 |
| 加 Tool | 手写 function calling 循环 | LangChain `bind_tools` | LangGraph `ToolNode` + 条件边 |
| 接 Langfuse | 手动埋点 | `config={"callbacks":[handler]}` | 同 V2 |
| 依赖 | `openai` | `+ langchain*` 三个 | `+ langgraph` 一个 |

**一句话决策**：**默认从 V2 起步**；除非已经看到了 V3 的信号（分支 / 工具 / HITL / 恢复），不要直接跳到 V3。**V1 留给 stub / 调试 / 对照实验**。

---

#### 怎么把这一节"做一遍"（推荐顺序）

1. 在 `scripts/` 下写 `learn_03a_v2_lcel.py`：拷 `learn_01_chat.py` 的骨架，把内部换成 V2 的 chain，**用同样的问题对比两份输出**。
2. 写 `learn_03b_v3_graph.py`：把 V2 的 chain 包成 3 节点 graph，并 `print(graph.get_graph().draw_mermaid())` 打印结构，肉眼确认流转。
3. 看完 1.3 + 这一节后，**先不动 `app/api/chat.py`**；等做完 Phase 2（RAG）后再回来一起把 V2 落到 `app/api/chat.py`——**那时 RAG 也只是 chain 中间多一个 retriever**，改动量最小。





## Phase 2：RAG 完整链路（3-5 天）

### 2.1 概念地图（先看，再动手）

RAG 可以拆成两条时间线：**离线建索引（ingestion）**和**在线问答（retrieve → augment → generate）**。下面先给「鸟瞰图」，再给「每层要决策什么」，最后是「翻车点速查」，方便你做 `learn_03_rag.py` 时对号入座。

#### 鸟瞰：离线 vs 在线

```
┏━━━━━━━━━━━━━━━━━━━━ 离线：把资料变成「可检索的库」━━━━━━━━━━━━━━━━━━━━━━━━┓
  原始文件（PDF/MD/HTML/工单/代码）
       │   可选：爬虫/OCR、去重、解密、MIME 校验
       ▼
  Loader（PyPDFLoader、Unstructured、FireCrawl……）
       │   一页/一块 → Document(page_content + metadata)
       ▼
  清洗（去页眉页脚、乱码段落、超长表格转摘要……）        ← 很多教程省略，但很影响命中率
       │
       ▼
  切分 TextSplitter（字符/Token 窗口、递归按标题）
       │   ├ chunk_size：单块信息量
       │   ├ chunk_overlap：跨段落语义不断裂
       │   └ 进阶：段落/语义切分、父子文档(parent→child)
       ▼
  Chunks = 切分产物【不是另一条流水线】：同一批 `Document`，只是每条的 `page_content` 已变短；metadata 仍可带 source/page/section
       │
       ▼
  Embedding（bge-m3、text-embedding-3-large……）
       │   注意：维度、归一化、与 reranker/向量库是否同一「语义空间」
       ▼
  向量 + 元数据 → 向量库（pgvector / Milvus / FAISS / Qdrant）
       │   建 HNSW/IVF 索引、collection 版本、权限与备份
       └──────────────────────────────────────────────────────────────┘

┏━━━━━━━━━━━━━━━━━━━━ 在线：用库「拼出」一次回答 ━━━━━━━━━━━━━━━━━━━━━━━━┓
  用户问题
       │   可选：Query 改写、多查询扩展、HyDE（用假答案再检索）
       ▼
  向量化（同一套 embedding）+ 可选过滤（metadata filter / SelfQuery）
       │
       ├─ 稠密检索：similarity_search / MMR（去冗余）
       ├─ 稀疏检索：BM25 / 全文（Postgres tsvector、Elasticsearch）
       └─ 混合：EnsembleRetriever（α·dense + (1-α)·sparse）
       ▼
  候选 chunks（先多取：例如 fetch_k=20）
       │
       ▼
  可选 Rerank（bge-reranker、Cohere Rerank）→ 截断为 top_k（如 4～8）
       │   解决「向量近但不对题」或「相关但排后面」
       ▼
  Context 组装
       │   排序（相关片段前置）、控制总 token、附 [来源] 便于引用与调试
       │   注意「lost in the middle」：超长 context 时模型对中间段不敏感
       ▼
  Prompt：system + 规则（只依据资料、不知道就说不知道）+ context + 问题
       ▼
  LLM 生成 + 可选：流式、JSON 模式、引用字段
       ▼
  最终回答（+ 出处列表 / 置信度说明）
       └──────────────────────────────────────────────────────────────┘
```

#### 每一层你在「调什么」

| 阶段 | 输入 / 输出 | 关键旋钮 | 典型取舍 |
| --- | --- | --- | --- |
| 加载 | 文件 → `Document` | Loader 质量、编码、是否 OCR | PDF 乱版时换 Loader 比调 chunk 更有效 |
| 切分 | 长文 → chunks | `chunk_size`、`chunk_overlap`、是否按标题切 | 太小丢上下文；太大噪声多、embedding 平均化 |
| 嵌入 | 文本 → 向量 | 模型、batch、是否归一化 | 中英混排常选多语模型（如 bge-m3） |
| 入库 | chunks → 索引 | 距离度量、索引类型、metadata 字段 | cosine 最常用；过滤条件要提前进 schema |
| 检索 | 问句 → 候选 | `k`、MMR `fetch_k`、混合权重 | 先宽后窄：多取再 rerank 往往比单卡 k 准 |
| 融合上下文 | 候选 → prompt 块 | token 预算、文档顺序、是否只引片段 | 给模型「可核对」的短引文 + 出处 |
| 生成 | prompt → 回答 | 温度、是否强制引用、拒答策略 | 低温度更贴材料；无引用要求时易胡编 |

#### 需要掌握的关键变量（在简略版上的扩展）

- **切分**：`chunk_size`、`chunk_overlap`；进阶还有父子块、语义边界。
- **检索**：`top_k`、`fetch_k`（MMR）、`distance_strategy`（`cosine` | `l2` | `inner`）、混合检索里的稠密/稀疏权重。
- **质量**：`reranker`（二阶段精排）、`metadata` 过滤（按课程/版本/时间线缩小搜索空间）。
- **系统**：embedding 与向量库维度一致、collection 版本与回滚、增量更新与删除策略（按 `source` 更新文档时先删后加）。

#### 翻车点速查（调参前先排除这些）

- **检索召回空或总不对**： Loader Garbage In（表格/脚注进不了文本）；chunk 切开关键句；问法与正文用词不一致 → 先试 **混合检索 / query 改写**。
- **上下文里有答案但模型乱答**：prompt 约束弱、温度过高、上下文过长埋没关键句 → **减噪、rerank、把规则写进 system**。
- **回答对但无法追溯**：chunks 没打好 `source/page` → **入库时写全 metadata，回答里要求列出处**。

以上地图与 Phase 2.2 的最小脚本一一对应：先把**离线四步（加载→切分→嵌入→入库）**和**在线三步（检索→拼 prompt→LLM）**跑通，再按需加混合检索、rerank、元数据过滤即可。

#### 2.1.1 每一步「为什么不能省」（底层原理串讲）

上面的地图告诉你「做什么」，这一节解释「为什么必须做」——RAG 里每一步都是在堵一个具体的失败模式，不是为了"看起来正规"。

##### 0. 先把「为什么要 RAG」想清楚

LLM 有两个硬约束：

1. **训练知识被冻结**：不知道你公司内部资料、不知道昨天发生的事
2. **上下文窗口有限**：即使 200K token，也塞不下整个知识库，而且**塞得越多越贵、越慢、越容易遗忘中间**（这是真实存在的现象，叫 *lost in the middle*）

而你想要的是：让模型**基于"特定资料"回答**，且资料还可能 GB 级、经常更新、不能瞎编。

RAG 的核心思想：**检索是搜索问题，生成是语言问题，分开干**。每次提问只把"最相关的那几页"塞进 prompt——既绕过窗口限制，又避免反复微调。

下面每一步，本质都是为了让"塞进去的那几页"足够准。

##### 1. Loader：为什么不能直接 `open()` 文件？

**核心矛盾**：原始文件是给"人"看的（PDF 有版面、Word 有样式、HTML 有标签），LLM 只吃**纯文本 + 一些元数据**。

PDF 里一个表格在内存中可能是几百个孤立的"文字 + 坐标"对象，直接读取拿到的是乱序乱码。Loader 干的事：**还原阅读顺序、剥离格式、保留结构信号**（标题级别、页码、来源）。

> Java 类比：你不会用 `FileInputStream` 读 `.docx`，你会用 Apache POI。同理。



##### 2. 清洗：为什么不直接进 Splitter？而是要先清洗

**核心矛盾**：垃圾会被一路放大。

embedding 是把整段文字"压"成一个向量。如果一段里 30% 是页眉"机密 - 第 3 页"，这个向量就被噪声拉偏了。**结果你查"休学规定"，反而把"机密"权重高的段排上来**——这种翻车非常常见。

清洗的本质：**提高信噪比**。垃圾在 embedding 之前删，比之后调任何参数都管用。



##### 3. 切分（Splitter）：为什么不能整篇进库？

这是最反直觉的一步，有**三个独立理由叠加**：

**3.1 Token 预算**

一篇文档 5 万 token，模型一次最多吃 8K-200K，**装得越多越贵、越慢、越容易遗忘中间**。所以只能塞"相关片段"，不是整篇。

**3.2 Embedding 的精度上限**

一个向量（比如 1024 维）能表达的语义信息是**有限的**。让一个向量代表 1000 字，等于让一个人用一句话总结整篇论文——细节全丢了。

> 直觉：把整本书压成一个向量，就像把整本书的 MD5 拿去搜——它确实是这本书的标识，但失去了"第 3 章在讲什么"的信息。

切成 500 字的小块，每块的向量更"专注"，**检索时区分度才高**。

**3.3 检索粒度**

你要的答案可能只用到 1-2 段，没必要把整篇 50 页塞进 prompt。**切小后，"召回"和"回答"的粒度对齐了**。

**3.4 为什么要 `chunk_overlap`？**

切分边界是机械的（按字符 / token 数），但语义边界不是。关键句可能正好被切在两块之间：

```
Chunk A: ...休学最长可以申请
Chunk B: 两年，超过需重新...
```

查"休学最长几年"，两块都不完整。重叠（相邻块共享 50-100 字）= **给语义边界一个缓冲带**，保证关键句至少完整出现在某一块里。



##### 4. Embedding：底层在做什么？

**核心思想**：把文本投到一个高维空间，**语义相近的句子在空间里距离近**。

怎么做到的？训练时给模型看大量"相似 / 不相似"句对（query, positive, negative），调整输出向量，使得：

- `cos(query, positive) → 1`
- `cos(query, negative) → 0`

训练完后，"休学申请条件"和"如何办理停学手续"虽然字面几乎不重合，但向量距离很近。**这是关键字搜索（BM25）做不到的——它只看字面共现**。

> 为什么用「向量」？因为向量空间里的距离（点积、余弦）能 O(N) 算，配合近似最近邻索引（HNSW）能近似 O(log N)。**这套架构之所以能用，本质是搜索效率撑得住**。

**维度一致性**：入库时用模型 A 生成 1024 维向量，查询时也必须用模型 A。**换 embedding 模型 = 整库重做**——这就是 embedding 选型是个大决策的原因。

###### 4.1 余弦相似度：怎么算的

两个向量 $(\mathbf{a} = (a_1,\ldots,a_n))、(\mathbf{b} = (b_1,\ldots,b_n))$ 的**余弦相似度**定义为它们夹角的余弦：

$$
[
\text{sim}_{\cos}(\mathbf{a},\mathbf{b})
= \cos\theta
= \frac{\mathbf{a} \cdot \mathbf{b}}{\lVert \mathbf{a} \rVert\,\lVert \mathbf{b} \rVert}
]
$$
拆开看：

- **点积** $(\mathbf{a} \cdot \mathbf{b} = a_1 b_1 + a_2 b_2 + \cdots + a_n b_n)$
- **范数（长度）** $(\lVert \mathbf{a} \rVert = \sqrt{a_1^2 + a_2^2 + \cdots + a_n^2})$

几何意义：**不看向量多长，只看方向**。方向相同 → 1；垂直 → 0；相反 → −1。

**小例子**（n=2）：$(\mathbf{a} = (3, 4))，(\mathbf{b} = (1, 0))$

- 点积：$(3\cdot 1 + 4\cdot 0 = 3)$
- 长度：$(\lVert\mathbf{a}\rVert = \sqrt{9+16}=5)，(\lVert\mathbf{b}\rVert = 1)$
- 余弦：$(3 / (5\cdot 1) = 0.6)$

**等价写法 / 工程优化**：先把每个向量**归一化**到长度 1（单位向量），再做点积，结果就是余弦：
$$
\hat{\mathbf{a}} = \frac{\mathbf{a}}{\lVert\mathbf{a}\rVert},\quad
\hat{\mathbf{b}} = \frac{\mathbf{b}}{\lVert\mathbf{b}\rVert},\quad
\text{sim}_{\cos} = \hat{\mathbf{a}} \cdot \hat{\mathbf{b}}
$$


这就是为什么**很多向量库存的是归一化后的 embedding**：查询时只要把 query 也归一化，**余弦 = 点积**，省掉除法和开方，HNSW 索引也能直接用内积度量。

> 与文档其他术语对应：`cosine` 距离常用 \($1 - \cos$) 表示（越小越相似）；`inner`（内积）+ 单位化向量 = 余弦相似度；`l2`（欧氏距离）单位化后与余弦排序一致。



###### 4.2 训练时怎么"逼"向量学到这个目标

训练用的是**对比学习（contrastive learning）**。每条训练样本是一个三元组：

$$
(\,q,\ d^{+},\ d^{-}_1, d^{-}_2, \ldots, d^{-}_K\,)
$$

- \($q$\)：query（如"休学最长几年"）
- $(d^{+})$：正例（真正能回答它的段落）
- \($d^{-}_k$\)：负例（无关或迷惑的段落，K 通常几十到几千）

模型把它们都过一次 encoder，输出向量 \($\mathbf{e}_q,\mathbf{e}^{+},\mathbf{e}^{-}_k$\)（一般已归一化）。

**两种最常见的损失函数**：

**(a) Triplet Loss**（早期，直观）
$$
\mathcal{L} = \max\!\big(0,\ \text{sim}(q, d^{-}) - \text{sim}(q, d^{+}) + m\big)
$$
\($m$\) 是 margin（如 0.2）。直觉：**正例的相似度比负例至少高 m，否则就有损失要反传**。

**(b) InfoNCE / 对比交叉熵**（现在主流，bge、E5、OpenAI embedding 都用）
$$
\mathcal{L} = -\log
\frac{\exp(\text{sim}(q, d^{+})/\tau)}
     {\exp(\text{sim}(q, d^{+})/\tau) + \sum_{k=1}^{K}\exp(\text{sim}(q, d^{-}_k)/\tau)}
$$
可以理解成"在 1 个正例 + K 个负例中做 K+1 类分类，要把正例那一类选对"。

- \($\tau$\)（温度，常 0.01~0.05）：越小，对相似度差距越敏感
- 分子大、分母小 → loss 小；反之就要把 \($\mathbf{e}_q$\) 朝 \($\mathbf{e}^{+}$\) 拉、把它推离所有 \($\mathbf{e}^{-}_k$\)

**反向传播在做的事**（直觉版）：梯度下降会同时调整 \($\mathbf{e}_q$\) 和 \($\mathbf{e}^{+}$\)、\($\mathbf{e}^{-}_k$\) 的方向——

- 把 \($\mathbf{e}_q$\) 和 \($\mathbf{e}^{+}$\) 往**同一方向**靠（夹角变小）
- 把 \($\mathbf{e}_q$\) 和每个 \($\mathbf{e}^{-}_k$\) 往**不同方向**推（夹角变大）

千百万对样本反复磨之后，**整个嵌入空间就被组织成"语义近的方向相近"**——这就是开头那两条目标 `cos(q,+)→1`、`cos(q,−)→0` 的真正含义。

**两个让效果起飞的工程细节**：

1. **In-batch negatives**：一个 batch 里 \(B\) 条 \($(q_i, d^{+}_i)$\)，对每个 \($q_i$\) 来说，**别人的 \($d^{+}_j$\)($j≠i$) 就是免费的负例**——一次 forward 拿到 B−1 条负例，训练效率高很多。
2. **Hard negative mining**：随机采样的负例太"明显"（学不到东西），于是先用旧模型检索出"看起来很像但其实不对"的段落当负例（如同主题但答非所问的）。**bge 系列效果好的关键之一**就是这套挖矿管线。

###### 4.3 这套机制带来的工程影响

- **归一化几乎是默认的**：训练时就已假设向量在单位球上，不归一化检索效果会下降。
- **不同模型的向量空间不通用**：模型 A 学到的"语义方向"和模型 B 完全不同——所以**换模型必须重做整库 embedding**。
- **同一模型不同版本（bge-v1 vs bge-v1.5）也不通用**：发版时要做"双写 + 切流"。
- **检索质量上限基本由 embedding 模型 + 训练数据决定**：调 chunk_size 是局部优化；想质变，常常要换更强的 embedding 或自己用领域语料微调（领域词汇、专有名词差异大时尤其明显）。

> **一句话**：余弦相似度只是一把"尺子"，真正决定它准不准的，是**训练时模型有没有学会让"语义近"的样本在这把尺子下读数高**。RAG 检索好不好，先看尺子合不合适，再调其他参数。



##### 5. 向量库：为什么不能用 MySQL？

普通数据库索引（B+ 树）是**精确匹配**或**范围查询**。向量检索的核心操作是"找最近的 k 个邻居"，B+ 树完全无能为力。

向量库的索引（HNSW、IVF）本质是**近似最近邻**（ANN）算法：

- 把高维空间用图 / 聚类预先组织
- 查询时不用扫全部 N 条，沿图跳几步就到"附近"
- 牺牲一点精确度（比如 95% 召回率），换 1000× 速度

pgvector 的优势：**就在 Postgres 里**，可以和元数据一起 JOIN（"只在 2024 之后的、属于本课程的文档里搜"）。这是纯向量库（FAISS）做不到的。



##### 6. 在线检索：为什么要做这么多花活？

**6.1 为什么要 Query 改写 / HyDE？**

用户问"老师我能晚点交吗"，文档里写的是"作业延期申请流程"。**词不一样，向量也未必近**——尤其是口语 vs 公文。

- **Query 改写**：让 LLM 把口语问题改写成多个正式表达，每个都去检索，并集召回
- **HyDE**：让 LLM 先"假装"写一个答案，用这个**假答案**去检索（因为答案的措辞更接近文档措辞）

本质都在解决：**问题和答案的"语言风格"不对齐**。

###### 6.1.1 HyDE 详解：用「假答案」去检索为什么有效

HyDE = **Hypothetical Document Embeddings**（假设文档嵌入），出自 Gao et al. 2022 的论文 *"Precise Zero-Shot Dense Retrieval without Relevance Labels"*。

**它解决的真实问题：query 和 document 的「分布鸿沟」**

回顾 §4：embedding 模型是用 \($(q, d^{+}, d^{-})$\) 对比学习训练出来的——但**训练样本里 query 和 document 都不是凭空出现的**：

- query 通常是**问题、关键词、短句**（"休学最长几年？"）
- document 通常是**陈述、段落、规章条文**（"学生因故确需休学者，每次最长不超过两年……"）

embedding 空间里，**问题和回答它的段落**虽然语义相近，但「形态」不同——一个是疑问句、口语化、缺主语；一个是陈述句、公文化、信息密。**它们在向量空间里其实有一定距离**，尤其在以下场景这条鸿沟会被放大：

- **口语 vs 公文**："能晚点交吗" vs "作业延期申请流程"
- **问句 vs 陈述句**："Python 怎么读 JSON" vs "使用 `json.loads()` 可以将……"
- **零样本 / 跨领域**：embedding 模型没在你的领域训练过，模型没学过"这个问法对应这种段落"
- **多语言混合**：英文问题问中文文档（或反过来）

**HyDE 的核心洞察**：既然问题难以直接匹配文档，那就**让问题先变成"伪文档"**——伪文档的形态和真文档接近，距离就近了。

**它的工作流程**

```
用户问题：休学最长能申请多少年？
        │
        ▼
[Step 1] LLM 生成「假答案」（hypothetical document）
        ↓
        "学生因故需要休学的，每次申请期限最长不超过两年。
         超过期限需要重新申请，并提交相关证明材料……"
         ↑↑↑ 这段话可能完全是编的，但「形态」像真的章程
        │
        ▼
[Step 2] 把假答案 embedding，作为查询向量
        ↓
        e_query = embed(假答案)         ← 不是 embed(原问题)
        │
        ▼
[Step 3] 用这个向量去向量库做相似度检索
        ↓
        匹配到真实的相关段落（命中率显著高于直接 embed 问题）
        │
        ▼
[Step 4] 把「真实段落」（不是假答案）+ 原问题 一起塞进 prompt 让 LLM 回答
```

**为什么假的也有用？三个层面**

1. **形态对齐**：假答案是陈述句、公文风、信息密——和文档同分布。即使内容编错了，**关键词、句式结构、领域术语都对了**，embedding 自然就近。
2. **关键词扩展（隐式 query expansion）**：假答案里会出现「申请」「期限」「证明材料」「重新办理」等问题里没有的相关词——相当于免费帮你把 query 扩展了一遍。
3. **冗余抗噪**：哪怕假答案有事实错误（比如说"最长 5 年"，实际是 2 年），错的那个数字在向量里只是一小点——而**整体语义方向**仍指向"休学 + 期限 + 申请"这一片，足以把真段落召回。检索完之后用的是真段落，假答案被丢掉，**幻觉不会传染到最终回答**。

**用一个直观比喻**

> 你想去图书馆找一本书，只记得"讲一个海上漂流的男孩和老虎的故事"——但卡片目录是按书名 / 作者排序的。直接去查会很难。
>
> HyDE 的做法：先**模仿一段书评**——"这是一部关于信仰与生存的寓言小说，主人公在一艘救生艇上与孟加拉虎相伴 227 天……"——再去图书馆按这段书评的措辞翻索引，**就更容易撞到《少年派的奇幻漂流》的目录条目**。
>
> 你不需要书评内容真实，**只需要它的「调性」和图书馆里别的书评一致**。

**和 Query 改写的区别（什么时候用哪个）**

| | Query 改写 | HyDE |
| --- | --- | --- |
| 做法 | 改写成 N 个等价问题 | 生成 1 段伪答案 |
| 形态变化 | 仍是问题 | 变成陈述/段落 |
| 解决重点 | 表述差异（同义词、口语→正式） | **形态差异**（问句→文档） |
| 适合场景 | 表述模糊或太短 | 跨领域、零样本、口语 vs 公文 |
| 成本 | 1 次 LLM 调用 + N 次检索 | 1 次 LLM 调用 + 1 次检索 |

实践中两者常一起用：**先 Query 改写得到 3-5 个变体，每个再做 HyDE 生成假答案**，并集召回 → rerank → top_k。

**HyDE 的代价与坑**

- **延迟和成本**：多一次 LLM 调用（不过通常用便宜的小模型生成假答案就够了，如 GPT-4o-mini）。
- **领域差距太大时不灵**：如果模型对该领域一无所知（比如非常专的内部产品名），它生成的假答案纯属胡编、关键词都对不上，反而拉偏检索方向 → **此时混合检索（BM25 + dense）+ 元数据过滤更可靠**。
- **不要混淆"假答案"和"最终答案"**：HyDE 只用于**检索阶段**，最终回答必须基于真实召回的文档，否则 RAG 的"可溯源"优势就没了。

**最小代码样例（与你后面的 `learn_03_rag.py` 风格一致）**

```python
def hyde_retrieve(question: str, retriever, llm) -> list[Document]:
    hypo_prompt = f"请用 1-2 段公文风的陈述句，假设性地回答以下问题（即使你不确定，也要写得像真的章程一样）：\n\n{question}"
    hypo_answer = llm.invoke(hypo_prompt).content
    return retriever.invoke(hypo_answer)
```

把这个返回的 docs 接到原来的 prompt 拼接逻辑里就完成了 HyDE 接入——**只改检索查询、不改生成阶段**。

**6.2 为什么要混合检索（dense + sparse）？**

向量检索懂语义但**不擅长精确实体**：你搜"GPT-4o 价格"，可能召回一堆关于 LLM 定价的语义近似段落，**偏偏漏掉真正写着"GPT-4o"的那段**。

BM25（稀疏检索）相反：只看字面，对**专有名词、版本号、错误码**特别准，但完全不懂同义词。

**两个方向的失败模式互补 → 加权融合**。这不是炫技，是工程必要的兜底。

**6.3 为什么要 Rerank（二阶段检索）？**

第一阶段（向量检索）用的是 **bi-encoder**：query 和 doc **各自**算向量再比距离。

- 优点：doc 向量预先算好存起来，查询时极快
- 缺点：query 和 doc **没有交互**，细微的相关性判断不出来

Rerank 用的是 **cross-encoder**：把 `(query, doc)` 拼成一对**整体**过一遍模型，输出一个相关性分。

- 精度高一个量级
- 但每次都要现算，无法预存

工程折中：**bi-encoder 粗筛 100 条 → cross-encoder 精排出 top-8**。这就是为什么常说"先宽后窄"。



##### 7. Context 组装：为什么顺序也重要？

研究（*"Lost in the Middle"*, Liu et al., 2023）发现：**LLM 对 prompt 开头和结尾最敏感，中间会被忽略**。所以工程上会：

- 最相关的 chunk 放**最前或最后**
- 不塞太多无关 chunk（摊薄注意力）
- 引文要短、要带 `[来源]`，让模型可"对照"

附 `[source]` 还有个隐藏作用：**一旦要求模型写出处，它就不敢瞎编**——这是 prompt 设计的一个软约束。



##### 8. Prompt 约束：为什么不能省？

LLM 默认的优化目标是**"说一段流畅的话"**，不是"严格基于材料"。如果不约束：

- 资料里没写 → 它会编一个看起来合理的（**幻觉**）
- 资料和它训练知识冲突 → 它可能选训练知识

System prompt 写"**仅依据下方资料回答；未提及就答'资料中未提及'**"，本质是**改写它的目标函数**——告诉它"宁可不答也别瞎答"是更优解。

##### 一句话把整条链路串起来

**RAG 的每一步都在堵一个具体的失败模式**：

| 步骤 | 在解决什么失败 |
| --- | --- |
| Loader | 文件读不进来 / 顺序乱 |
| 清洗 | 噪声拉偏向量 |
| 切分 | 窗口装不下 + 向量精度不够 + 检索粒度太粗 |
| Overlap | 语义被切在边界上 |
| Embedding | 字面搜索找不到同义 |
| 向量库 | 上亿条怎么秒级查 + 怎么按元数据过滤 |
| 下面是回答的步骤 |  |
| Query 改写 / HyDE | 问句和文档语言风格不对齐 |
| 混合检索 | 向量漏专有名词 |
| Rerank | 语义近 ≠ 真的对题 |
| Context 排序 | 中间内容被忽略 |
| Prompt 约束 | 模型爱瞎编 |

**以后你看到一个 RAG 项目效果不好，按这条链路逐层排查**——是哪一步的失败模式没解决？而不是盲目调 `chunk_size`。



#### 2.1.2 窗口、KV Cache 与「装不下」的处理策略

§2.1.1 解释了 RAG 每一步「为什么这么做」；这一节解释**它的核心约束——上下文窗口——到底从哪儿来，以及当 RAG 召回的内容超过窗口时该怎么办**。

##### A. RAG 在 prompt 里长什么样

最朴素的形态：

```
[system] 仅依据下方资料回答，未提及就说不知道。
[context]
  --- 来源：学籍规定.md, 第3页 ---
  休学最长可申请2年...
  --- 来源：学籍规定.md, 第7页 ---
  续期需在到期前30天提交...
[user] 休学最长能申请多少年？
```

`system` + `context` + `user` + `历史对话` + **模型生成的 output**——**这一整坨加起来不能超过窗口**。换句话说，**输入 + 输出共用同一个窗口预算**，模型生成时也在吃这个额度。

##### B. 为什么 LLM 窗口有大小限制？四个独立瓶颈

光解决一个不够，要四个一起解决，所以"做大窗口"是真正的工程难题。

**B.1 根本原因：Self-Attention 的 O(n²) 复杂度**

Transformer 的核心操作是「每个 token 都要和其他所有 token 算一次相关性」：

$$
[
\text{Attention}(Q, K, V) = \text{softmax}\!\left(\frac{QK^\top}{\sqrt{d}}\right) V
]
$$
$(QK^\top) $是一个 **n × n 的矩阵**——n 是序列长度。

| n（token 数） | 注意力矩阵元素 | 相对计算量 |
| --- | --- | --- |
| 1K | 100 万 | 1× |
| 10K | 1 亿 | 100× |
| 100K | 100 亿 | 10000× |
| 1M | 1 万亿 | 100 万× |

**n 翻 10 倍 → 计算和显存翻 100 倍**。这是 Transformer 架构层面的硬约束。

> Java 类比：双重 for 循环嵌套，n 一旦上去，时间和内存炸得很快。

**B.2 推理时的真凶：KV Cache**

每生成 1 个 token，所有历史 token 的 Key/Value 都得存在显存里（不存就要每步重算，更慢）。

> **KV cache 具体缓存什么？**
>
> 在自注意力里，每层都会从当前层 hidden state 线性变换出 Q,K,V。
>
> 生成时（自回归）：
>
> - 新 token 来了，只需要算这个新 token 的 Q,K,V
> - 过去 token 的 K,V 不变，可以复用
> - 所以把过去 token 的 K,V 存起来，就是 KV cache
>
> 缓存维度是“层级别 + 头级别”的，不是只存一份全局向量。
> 可理解为：每层都有一套“历史记忆键值表”。
>
> 注意不会存Q，因为每一步只需要“当前 token 的 Q”去和“历史所有 K”做匹配，再对“历史所有 V”加权求和。
>
> - 历史 token 的 Q 对下一步没用
> - 历史 token 的 K/V 会反复被用

KV Cache 大小公式（每 token，单位字节）：

```
2 (K和V) × n_layers × n_kv_heads × head_dim × 精度字节数
```

拿 **Llama 3 70B** 算（80 层、8 个 KV head、head_dim=128、fp16=2 字节）：

```
每个 token 的 KV = 2 × 80 × 8 × 128 × 2 ≈ 320 KB
```

| 序列长度 | KV Cache 显存 |
| --- | --- |
| 4K | 1.3 GB |
| 32K | 10 GB |
| 128K | **40 GB** |
| 1M | **320 GB**（一张 A100/H100 都装不下） |

模型权重本身只有 140 GB——**长 context 跑起来，KV cache 比权重还大**。这就是云厂商对长上下文单独收费、单独排队的原因。

**B.3 训练时的限制：位置编码"训不到"**

模型靠**位置编码**（绝对 PE / RoPE / ALiBi）感知 token 之间的距离。训练时如果只见过 0~4096 的位置，那"第 5 万个位置长什么样"模型根本没学过——属于**分布外（OOD）**。

这就是为什么 GPT-3.5（训练 4K）你硬塞 8K 进去会胡言乱语。

> 现代有 **YaRN / NTK-aware scaling** 等位置编码外推技巧，让 4K 训练的模型外推到 32K——但**有损耗**，且需要少量长样本微调。

**B.4 哪怕装下了，效果也衰减（Lost in the Middle）**

Liu et al. (2023) 的著名研究：把答案放在 prompt 不同位置，准确率成 **U 型**——开头和结尾高，中间塌陷。

```
准确率
  ▲
  │ ●──                            ──●
  │     ●                        ●
  │        ●                  ●
  │           ●            ●
  │              ●  ●  ●
  │
  └──────────────────────────────────▶ 答案在 context 中的位置
    开头     1/4    中间    3/4   结尾
```

原因：

- **训练数据里"真正长依赖"的样本太稀缺**——大多数文本里关键信息都在邻近段
- **注意力被稀释**——n 越大，softmax 后每个 token 拿到的权重越摊薄

**所以「窗口能装」≠「模型真能用」**。这是工程上必须接受的事实。

**B.5 那为什么 Gemini / Claude 现在能做到 1M？**

不是单点突破，而是几条路一起走：

| 技术 | 解决什么 |
| --- | --- |
| **Flash Attention** | 显存上不再实例化 n×n 矩阵（数学复杂度仍是 O(n²)，但 IO 降一个数量级） |
| **Sliding Window / Sparse Attention** | 让大部分 token 只看局部，少数看全局 |
| **GQA / MQA** | 多 Query 共享 K/V，砍 KV cache（这就是 Llama3 把 KV head 从 64 降到 8 的原因） |
| **RoPE Scaling / YaRN** | 位置编码外推 |
| **Ring Attention / 序列并行** | 训练时把长序列切到多卡上 |
| **Mamba / SSM** | 抛弃 attention，走线性复杂度——但还在追赶 Transformer 的能力 |

代价：**贵 + 慢 + 中段衰减依然存在**。"针在草垛"测试很漂亮，但真实多文档推理任务上，10K~30K 之后准确率就下滑。

##### C. 当 RAG 内容多到装不下：7 种处理策略

从轻到重排列。**绝大多数业务用前两招就够了，别上来就上 map-reduce**。

**C.1 不要让它"装不下"——先在检索层瘦身（最常用）**

90% 的"装不下"问题，根源是检索召回太多 / 太杂。先做：

- **Rerank 后截断 top-k**：粗筛 100 → 精排取 8（先宽后窄）
- **更细的元数据过滤**：按时间、文档类型、租户 ID 缩小搜索空间
- **更小的 chunk + 更精的 query 改写**：降低单条 chunk 大小

**C.2 Stuff（直接塞）—— 最简单**

`context` 直接拼进 prompt，能装就装。LangChain 的 `stuff` 链就是这个。**默认方案**。

**C.3 Map-Reduce（并行 + 聚合）—— 真装不下时**

```
            ┌──→ LLM(chunk_1) → 局部答案_1 ┐
检索 100 段 ─┼──→ LLM(chunk_2) → 局部答案_2 ┼──→ LLM(汇总所有局部) → 最终答案
            └──→ LLM(chunk_n) → 局部答案_n ┘
```

- 优点：可以处理任意大的语料；并行
- 缺点：调用次数 ×N，**贵**；汇总时局部信息已丢失，**复杂推理变差**

适合：摘要、信息抽取这种"每块独立"的任务。

**C.4 Refine（迭代精化）—— 串行**

```
chunk_1 → LLM → 初稿
↓
初稿 + chunk_2 → LLM → 改稿
↓
改稿 + chunk_3 → LLM → 再改稿
↓ ...
最终答案
```

- 优点：信息保留更连贯；适合长文档摘要
- 缺点：串行慢；前面的内容会被"稀释"（隔代效应）

**C.5 Map-Rerank —— 让模型自己挑**

每个 chunk 让模型不仅给答案、还给一个**置信度分数**，最后取分最高的那个。

适合：**事实性问答**（答案就在某一块里，不需要跨块综合）。

**C.6 Agent / 多轮检索 —— 让模型自己决定要不要继续**

```
[Agent 循环]
1. 先检索 5 条 → 看够不够回答
2. 不够 → 用现有信息生成新 query → 再检索
3. 够了 → 输出答案
```

这就是 **LangGraph / ReAct Agent** 的事（Phase 3 的内容）。

- 优点：**按需取**，token 总量小
- 缺点：调用轮次不可控、可能死循环

**C.7 Prompt 压缩**

**LongLLMLingua / LLMLingua-2** 这类工具：用一个小模型把 prompt 中冗余的字"删掉"（人类读不太通顺，但 LLM 还能理解），压缩 2-10 倍。

适合：context 巨大但延迟敏感的场景。代价：实现复杂、压坏了不好排查。

**C.8 兜底：直接上长 context 模型**

最暴力——装不下就换装得下的。Gemini 2.5 Pro / Claude 4.5 到几十万 token 是现实选项。

代价：**单次请求贵几十倍、慢几倍、中段衰减**。**不要把它当 RAG 的替代品**——它能装更多 ≠ 它能更好地用更多。

##### D. 选型速查

| 你的场景 | 推荐 |
| --- | --- |
| 普通问答（答案在 1-3 段里） | **Stuff + Rerank**（90% 业务） |
| 长文档摘要 | Refine 或 Map-Reduce |
| 跨数百份文档的信息汇总 | Map-Reduce |
| 事实查找题 | Map-Rerank |
| 复杂推理 / 探索性任务 | **Agent 多轮检索**（Phase 3） |
| Token 紧、延迟敏感 | Prompt 压缩 |
| 实在没办法 | 长 context 模型兜底 |

> **一句话总结**：窗口限制源自架构（O(n²)）、显存（KV cache）、训练（位置 OOD）、效果（中段衰减）四道墙；真到了"装不下"，**先优化检索质量、再考虑 chain 策略，最后才换长 context 模型**。





### 2.2 项目 A：自己写一个最小 RAG（pgvector + LangChain）⭐ 必做

> **这是与我们项目最贴的练习**。我们的向量库就是 pgvector，跑通这一步后基本可以直接搬到 `app/rag/`。

**前置**：`make dev-up` 把 `deploy/docker-compose.dev.yml` 起来，里面 `pgvector` 镜像已经包含 vector 扩展。如果还没起，跑：

```bash
make dev-up
psql "postgresql://qicheng:qicheng@127.0.0.1:5432/qicheng" -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

参考教程（任选一份对照着写）：

- 官方文档：<https://python.langchain.com/docs/integrations/vectorstores/pgvector/>
- 中文版手把手：<https://mljourney.com/langchain-and-pgvector-building-high-performance-vector-search-with-postgres/>
- 端到端实操：<https://vitaliihonchar.substack.com/p/python-rag-api-tutorial-with-langchain>

写到 `ai/scripts/learn_03_rag.py` 大致结构（伪代码）：

```python
# 1. 准备一份资料：在 ai/data/raw/ 放一份学校学籍管理规定.md
# 2. 加载 + 切片
loader = TextLoader("data/raw/学籍规定.md", encoding="utf-8")
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=80)
chunks = splitter.split_documents(loader.load())

# 3. 接 embedding（先用 One-API 提供的 OpenAI 兼容 embedding，
#    上游可换 bge-m3 / text-embedding-3-large）
embeddings = OpenAIEmbeddings(
    base_url=settings.one_api_base_url,
    api_key=settings.one_api_key,
    model="text-embedding-3-large",
)

# 4. 入库
store = PGVector(
    embeddings=embeddings,
    collection_name="learn_kb",
    connection="postgresql+psycopg://qicheng:qicheng@127.0.0.1:5432/qicheng",
)
store.add_documents(chunks)

# 5. 查询 + 生成
retriever = store.as_retriever(search_kwargs={"k": 4})
docs = retriever.invoke("休学最长可以申请多少年？")
prompt = "基于以下资料回答：\n\n" + "\n\n".join(d.page_content for d in docs) + "\n\n问题：休学最长可以申请多少年？"
answer = llm.invoke(prompt)
```

跑通的判断标准：你修改 `data/raw/` 的内容后，回答会跟着变。

**进阶练习**（每个 1-2h）：

1. 增加文件来源元数据（`metadata={"source": "学籍规定.md", "page": 3}`），让回答带"参考出处"。
2. 把 `chunk_size` 从 500 改成 200 / 1000，对比检索质量。
3. 加一层 BM25 做混合检索（参考 LangChain `EnsembleRetriever`）。

### 2.3 项目 B：Langchain-Chatchat（看大型 RAG 项目长什么样）

> **不要把它当生产代码抄**，但它是中文场景下最完整的 RAG + Agent 开源项目，**目录结构、配置组织、知识库管理 UI** 都值得借鉴。

- GitHub：<https://github.com/chatchat-space/Langchain-Chatchat>（37K stars）
- 教程：<https://juejin.cn/post/7434177867375837247>

启动方式（约 30 分钟）：

```bash
# 推荐用一个独立 venv 或 conda 环境，不要污染 qicheng 项目
python -m venv ~/labs/chatchat-venv && source ~/labs/chatchat-venv/bin/activate
pip install -U pip
pip install "langchain-chatchat[xinference]" -i https://pypi.tuna.tsinghua.edu.cn/simple/

# 起 xinference（Mac 用 CPU/MPS 都行）
pip install "xinference[all]"
xinference-local --host 0.0.0.0 --port 9997
# 在 xinference UI 部署一个 qwen2-instruct-1.5b 和 bge-small-zh

export CHATCHAT_ROOT=~/labs/chatchat-data
chatchat init
# 编辑 model_settings.yaml 把 DEFAULT_LLM_MODEL/EMBEDDING 改成你部署的模型
chatchat kb -r
chatchat start -a
# 默认 8501 是 webui
```

**重点读它的源码**（在 GitHub 网页上读即可）：

- `libs/chatchat-server/chatchat/server/chat/`：对话流转
- `libs/chatchat-server/chatchat/server/knowledge_base/`：知识库管理
- `libs/chatchat-server/chatchat/server/agent/`：Agent 调度

读完做一份笔记：**它是怎么把"上传文档 → 切片 → 入库 → 检索 → 回答"做成 API 的？**

> **风险提示**：Chatchat 0.3.x 还在用一些旧版 LangChain API，不能直接 1:1 抄，理解思路即可。

### 2.4 RAG 进阶资料（按需）

**带回 `qicheng-ai`**：把 `learn_03_rag.py` 拆成 `app/rag/loader.py`、`app/rag/splitter.py`、`app/rag/store.py`、`app/rag/retriever.py`，然后在 `app/api/chat.py` 里加一个 `mode=rag` 分支。



这一节不要只停留在概念名词上。已在 `phase2_rag/` 中补齐一组与 `06_search_compare.py` 风格一致的进阶练习，建议按下面顺序跑：

```bash
uv run python phase2_rag/07_reranker.py
uv run python phase2_rag/08_parent_child.py
uv run python phase2_rag/09_hyde.py
uv run python phase2_rag/10_multi_query.py
uv run python phase2_rag/11_self_query.py
uv run python phase2_rag/12_contextual_compression.py
uv run python phase2_rag/13_rag_eval.py
```

> 其中 `09_hyde.py`、`10_multi_query.py`、`11_self_query.py`、`12_contextual_compression.py` 需要能调用 One-API 兼容的 chat model；`07_reranker.py` 需要 `sentence-transformers`。

#### 2.4.1 Reranker：召回之后再精排

对应示例：`phase2_rag/07_reranker.py`

**解决的问题**：第一阶段检索追求快，常把真正相关的 chunk 排在第 7、12、20 名；但最终只给 LLM Top-4 时，它就被截掉了。

RAG 里常把检索拆成两阶段：

```text
query
  → 向量/BM25/混合检索先召回 Top-20/50/100
  → Cross-Encoder Reranker 对 (query, chunk) 逐对打分
  → 精排取 Top-4/8 给 LLM
```

向量检索使用 Bi-Encoder：query 和 doc 分开编码，文档向量可提前入库，所以非常快；缺点是 query 和 doc 没有充分交互，细微相关性判断不够准。Reranker 多用 Cross-Encoder：把 query 与 doc 拼到一起过模型，直接判断这对文本是否相关，精度更高，但成本也更高。

`07_reranker.py` 里重点观察：

- `RECALL_K = 20`：先多召回，别太早截断。
- `FINAL_K = 4`：精排后才取最终结果。
- `original_rank`：看某个 chunk 原本在向量召回中排第几，精排后是否被拉到前面。

工业常见组合是：`Hybrid Retrieval → RRF → Reranker → Top-K`。

#### 2.4.2 父子文档：小块检索，大块回答

对应示例：`phase2_rag/08_parent_child.py`

**解决的问题**：chunk 太小，检索准但上下文不完整；chunk 太大，上下文完整但 embedding 语义被摊薄，检索不准。

父子文档的核心策略是：

```text
原文
  → parent chunks：较大，比如 1200 字，保留完整上下文
  → child chunks：较小，比如 200 字，挂 parent_id，入向量库检索

在线：query → 检索 child → 根据 parent_id 找回 parent → 去重 → 给 LLM
```

这也叫 Small-to-Big Retrieval：用小块定位，用大块回答。

`08_parent_child.py` 里重点观察：

- `split_parents()`：生成较大的 parent。
- `split_children()`：把每个 parent 再切成小 child，并继承 `parent_id`。
- `parent_child_search()`：检索 child，但返回 parent。
- 输出中的 `child_hit_ranks`：表示这个 parent 是被哪些 child 命中的。

它特别适合制度、合同、手册这类上下文依赖强的文档。

#### 2.4.3 HyDE：先生成假设答案，再用假设答案检索

对应示例：`phase2_rag/09_hyde.py`

HyDE = Hypothetical Document Embeddings。它不是让 LLM 直接回答，而是让 LLM 先写一段「像答案的假设文档」，再把这段假设文档拿去向量检索。

为什么有效？用户 query 往往短、口语化、信息少，例如：

```text
我想停一段时间不上学，最长能多久？
```

而制度正文可能是：

```text
学生因故申请休学的，应当办理休学手续，休学期限累计不得超过……
```

问题和文档在「语言形态」上不一致。HyDE 让 LLM 先把问题改写成一段正式、公文风、陈述句的伪文档，缩小 query 与 document 的分布差异。

关键原则：

- 假设答案只用于检索。
- 最终回答仍必须基于真实召回的 chunks。
- 如果领域术语模型完全不知道，HyDE 可能拉偏；这时 BM25/混合检索更稳。

`09_hyde.py` 里重点观察：

- 直接用原始 query 检索的 Top-K。
- LLM 生成的假设文档。
- 用假设文档检索的 Top-K 是否更贴近真实条款。

#### 2.4.4 Multi-Query：一个问题，多种问法一起搜

对应示例：`phase2_rag/10_multi_query.py`

**解决的问题**：单个 query 视角太窄，尤其是多意图问题、口语化问题、同义词较多的问题。

例如：

```text
国家助学金需要哪些申请材料？发放时间是什么时候？
```

它至少包含两个子意图：

- 申请材料
- 发放时间

Multi-Query 会让 LLM 生成多个检索 query，每个 query 各自检索，然后合并去重：

```text
原始问题
  → 改写1：国家助学金申请材料
  → 改写2：家庭经济困难学生资助申请需提交材料
  → 改写3：国家助学金发放时间
  → 改写4：助学金评审和发放流程
  → 多路检索 → 合并候选 → 后续 rerank
```

`10_multi_query.py` 里重点观察：

- LLM 改写出了哪些 query。
- 哪些 chunk 被多个 query 命中。
- 合并候选数量是否比单 query 更丰富。

注意：Multi-Query 提高的是召回率，可能带来更多噪声，所以最好后接 Reranker。

#### 2.4.5 SelfQuery：把自然语言里的过滤条件变成 metadata filter

对应示例：`phase2_rag/11_self_query.py`

**解决的问题**：用户问题里经常同时包含语义查询和结构化过滤条件。

例如：

```text
只看资助相关规定，国家助学金需要哪些申请材料？
```

它可以拆成：

```text
semantic_query = "国家助学金需要哪些申请材料"
metadata_filter = {"category": "资助"}
```

SelfQuery 的本质不是「更聪明地向量化」，而是让 LLM/解析器把自然语言里的限制条件抽出来，变成向量库可执行的 filter。这样能显著缩小搜索空间。

`11_self_query.py` 没有直接使用 LangChain 的 `SelfQueryRetriever` 黑盒，而是手写了一个最小版本，便于理解：

- 给每个 chunk 打 `category` metadata。
- 用 LLM 把问题解析为 JSON：`semantic_query` + `category`。
- 检索时给 PGVector 传入 `filter`。

生产注意事项：

- filter 字段必须白名单化，不能让 LLM 任意生成字段和操作符。
- metadata 最好来自业务系统、目录结构或人工标注，而不是临时关键词猜测。
- LLM 解析失败时应降级为无过滤检索。

#### 2.4.6 Contextual Compression：只保留 chunk 中真正相关的句子

对应示例：`phase2_rag/12_contextual_compression.py`

**解决的问题**：检索到的 chunk 不一定整块都相关。一个 500 字 chunk 里可能只有 1 句话回答问题，其余都是噪声。噪声会消耗 token，也会干扰模型注意力。

上下文压缩的流程：

```text
query + retrieved chunks
  → 对每个 chunk 抽取与 query 直接相关的句子
  → 丢弃无关 chunk 或无关句子
  → 用压缩后的 context 生成答案
```

`12_contextual_compression.py` 中用 LLM 手写了一个压缩器：

- 输入：问题 + 一个 chunk。
- 输出：相关原文句子，或「无关」。
- 对比压缩前后的总字符数。

优点：减少 token、降低噪声。缺点：每个 chunk 都要额外调用模型，慢且贵。生产里可以考虑小模型、规则抽取、reranker 分数阈值等替代方案。

#### 2.4.7 RAG 评估：别靠感觉调参

对应示例：`phase2_rag/13_rag_eval.py`

**解决的问题**：改了 chunk_size、top_k、混合检索、reranker 后，如果没有评估集，就只能靠肉眼感觉判断，容易误判。

最小评估可以先只评「检索」：

- Hit@K：Top-K 中是否命中任一标准相关 chunk。
- MRR：第一个相关 chunk 的倒数排名。相关 chunk 排第 1，MRR=1；排第 4，MRR=0.25。

`13_rag_eval.py` 为了自包含，用关键词自动构造 gold set。真实项目应该人工标注：

```text
question -> relevant_chunk_ids
```

建议你维护一个 20-50 条的小测试集，覆盖：

- 精确数字问题：休学最长几年？
- 专有名词问题：国家奖学金怎么评？
- 多意图问题：材料 + 时间。
- 否定/边界问题：什么情况下不能申请？

后续上 Ragas 时，再评估 answer relevancy、faithfulness、context precision、context recall 等生成质量指标。

#### 2.4.8 推荐学习顺序

```text
06_search_compare.py      混合检索：dense + BM25 + RRF
  ↓
07_reranker.py            二阶段精排，最常用、收益明显
  ↓
08_parent_child.py        小块检索，大块回答，解决上下文不足
  ↓
13_rag_eval.py            建立评估基线，避免凭感觉调参
  ↓
09_hyde.py                解决短 query / 口语 vs 公文分布差异
10_multi_query.py         提高多意图问题召回率
11_self_query.py          自然语言条件 → metadata filter
12_contextual_compression.py  压缩上下文，减少 token 和噪声
```

**带回 `qicheng-ai`**：把 `learn_03_rag.py` 拆成 `app/rag/loader.py`、`app/rag/splitter.py`、`app/rag/store.py`、`app/rag/retriever.py`，然后在 `app/api/chat.py` 里加一个 `mode=rag` 分支。进阶能力可逐步拆成：`app/rag/reranker.py`、`app/rag/query_transform.py`、`app/rag/filters.py`、`app/rag/eval.py`。

---

### 2.X 生产级 RAG 完整能力清单（从 Demo 到生产必做的事）

> Demo 级 RAG 只需要 5 步（加载 → 切分 → embedding → 检索 → 拼 prompt），但**生产级 RAG 需要 12+ 个能力点**。下表逐项展开,你可以当作"实施 checklist"按顺序补齐。

#### 2.X.1 完整能力地图

| # | 能力 | 解决的问题 | Demo 必做? | 生产必做? | 对应 phase2_rag/ 示例 | 推荐技术栈 |
|:--|:--|:--|:--:|:--:|:--|:--|
| 1 | **文档解析** | PDF / Word / Excel / PPT / 图片 / 扫描件 | ✅ | ✅ | `01_loaders.py` | `unstructured` / `pymupdf4llm` / `MinerU` / `RagFlow-DeepDoc` |
| 2 | **文档切分** | 按标题/语义/表格层级切分,而非死板按字数 | ✅ | ✅ | `02_text_splitter.py` | `MarkdownHeaderTextSplitter` / `SemanticChunker` |
| 3 | **Embedding 选型** | 中文场景 BGE/M3E 优于 OpenAI ada | ✅ | ✅ | `03_pgvector_minimal.py` | `bge-large-zh-v1.5` / `bge-m3` / `Qwen3-Embedding` |
| 4 | **向量库** | 持久化、可过滤、可索引 | ✅ | ✅ | `03_pgvector_minimal.py` | **PGVector**（推荐） / Milvus / Qdrant |
| 5 | **混合检索 (Hybrid)** | 向量检索 + BM25 + RRF,召回率提升 30%+ | ❌ | ✅ | `06_search_compare.py` | `pgvector + tsvector` / Elasticsearch |
| 6 | **Reranker** | 检索结果重排,精确率提升 20%+ | ❌ | ✅ | `07_reranker.py` | `bge-reranker-v2-m3` / `Cohere Rerank` |
| 7 | **Parent-Child / 大小块** | 小块用于检索,大块用于回答 | ❌ | ✅ | `08_parent_child.py` | LangChain `ParentDocumentRetriever` |
| 8 | **Query Rewrite** | 改写口语化/不完整 query → 提高召回 | ❌ | ✅ | `09_hyde.py` / `10_multi_query.py` | HyDE / Multi-Query / Step-Back |
| 9 | **Metadata Filter** | 权限/部门/时间/标签过滤(生产必做) | ❌ | ✅ | `05b_pgve*_*wer.py` | PGVector `jsonb` 过滤 |
| 10 | **Self-Query** | 自然语言条件 → 自动生成 metadata filter | ❌ | ⚠️ | `11_self_query.py` | LangChain `SelfQueryRetriever` |
| 11 | **Context Compression** | 长上下文压缩,减少 token 和噪声 | ❌ | ⚠️ | `12_context*ression.py` | LLMChainExtractor / EmbeddingsFilter |
| 12 | **引用溯源** | 答案精确到页码/段落/文件版本 | ⚠️ | ✅ | `04_rag_with_source.py` | metadata 中存 page/source/chunk_id |
| 13 | **RAG 评估** | Hit@K / MRR / faithfulness / answer relevance | ❌ | ✅ | `13_rag_eval.py` | `RAGAS` / `TruLens` / 自建 golden set |
| 14 | **知识库管理** | 多 collection / 版本 / 增量更新 / 删除 | ❌ | ✅ | (待补) | 自建 + PGVector schema 设计 |
| 15 | **反馈闭环** | 用户点赞/踩 / 纠错 / 加入 golden set | ❌ | ✅ | (待补) | 数据库 + 离线分析 + 持续优化 |
| 16 | **数据安全** | 脱敏 / 权限隔离 / 加密存储 | ❌ | ✅ | (待补) | 入库前脱敏 + Row-Level Security |
| 17 | **缓存层** | 高频 query 缓存,降本提速 | ❌ | ⚠️ | (待补) | Redis + query 归一化 |
| 18 | **多模态 RAG** | 图片/表格/公式的检索 | ❌ | 视场景 | (待补) | CLIP / 表格抽取 / OCR |

**图例**：✅ 必做 / ⚠️ 视场景 / ❌ 可选

#### 2.X.2 生产级 RAG 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                     用户提问 "休学最多几年?"                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 1: Query 处理                                                  │
│   ├─ 1.1 query 归一化（去除停用词、统一全半角）                        │
│   ├─ 1.2 query 改写（HyDE / Multi-Query / Step-Back）                │
│   ├─ 1.3 意图分类（是规章问题?闲聊?数学计算?）→ 不需要 RAG 直接走 LLM   │
│   └─ 1.4 缓存查询（命中直接返回）                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 2: 混合检索（召回阶段,目标:high recall）                         │
│   ├─ 2.1 向量检索（dense, top 50）                                   │
│   ├─ 2.2 BM25 检索（sparse, top 50）                                 │
│   ├─ 2.3 RRF 融合（合并去重 → top 30）                                │
│   └─ 2.4 Metadata Filter（权限/部门/时间）                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 3: 精排（rerank 阶段,目标:high precision）                      │
│   ├─ 3.1 Reranker 模型打分（bge-reranker-v2-m3）                     │
│   ├─ 3.2 取 top 5（保证质量）                                        │
│   └─ 3.3 Parent-Child:  把检索到的小块替换为对应大块（保留上下文）       │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 4: 上下文压缩（可选）                                           │
│   └─ 提取每个 chunk 中和 query 真正相关的句子                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 5: 答案生成                                                    │
│   ├─ 5.1 拼 system prompt + context + question                       │
│   ├─ 5.2 调用 LLM（流式输出）                                         │
│   └─ 5.3 强制要求引用 [片段编号],便于溯源                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Stage 6: 后处理                                                      │
│   ├─ 6.1 答案安全检测（避免幻觉、敏感词过滤）                          │
│   ├─ 6.2 引用补全（把 [片段1] 替换为真实文件链接 + 页码）              │
│   ├─ 6.3 写入 trace（Langfuse）                                      │
│   └─ 6.4 提供反馈入口（点赞/踩 → 进入 golden set）                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              返回答案 + 引用来源 + trace_id（用于反馈）                  │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2.X.3 离线索引流水线（同样不能少）

> 上面是**在线问答流水线**,生产中你还需要一条**离线索引流水线**:

```
文档上传 / 同步
    │
    ▼
┌───────────────────┐
│ 1. 文档解析        │  PDF/Word/扫描件 → Markdown/纯文本
│   - PyMuPDF4LLM   │  保留标题层级、表格结构、图片位置
│   - unstructured  │
│   - OCR(扫描件)   │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 2. 文档清洗        │  去页眉页脚、去水印、修正乱码
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 3. 智能切分        │  按标题层级 + 语义边界,而非死板字数
│   parent: 章节    │  父块用于回答,子块用于检索
│   child: 段落     │
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 4. Metadata 抽取   │  source / page / section / dept / tags / version
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 5. Embedding 生成  │  bge-m3 / qwen3-embedding,batch 处理
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 6. 入库            │  PGVector 存向量 + jsonb metadata
│                   │  同时建 BM25 索引(tsvector)
└─────────┬─────────┘
          ▼
┌───────────────────┐
│ 7. 索引验证        │  随机采样 query → 检验召回质量
└───────────────────┘
```

#### 2.X.4 RAG 评估的最小可行方案

> **不评估的 RAG 等于裸奔**——你不知道改了 chunk_size 是变好还是变差。

最小评估方案分三步：

**Step 1：建 Golden Set（黄金问答集）**

```python
# data/golden_set.jsonl
{"id": "001", "question": "休学最多几年?",
 "expected_chunks": ["policy_v3.pdf#p15"],  # 标准答案应来自哪些 chunk
 "expected_answer": "每次不超过一年,累计不超过两年"}
{"id": "002", "question": "...", ...}
```

至少手动标注 50-100 条,覆盖你业务的典型 query。

**Step 2：跑离线评估**

```python
# 检索阶段
- Hit@5:  top 5 中是否包含 expected_chunks → 召回率
- MRR:    expected_chunks 在结果中的平均排名 → 排序质量

# 生成阶段
- Faithfulness:    答案是否完全基于 context（无幻觉）
- Answer Relevance: 答案是否真的回答了问题
- Context Precision: context 中有用的占比
```

**Step 3：建立基线 → 改一处 → 重新评估**

```
基线  : Hit@5=70%, MRR=0.65, Faithfulness=80%
+加 reranker → Hit@5=85%, MRR=0.78, Faithfulness=82%  ✅ 改进有效
+加 HyDE      → Hit@5=82%, MRR=0.75, Faithfulness=80%  ❌ 反而下降,回退
```

工具推荐：**RAGAS**（最常用） / **TruLens** / **DeepEval**。

#### 2.X.5 反馈闭环（生产 RAG 的灵魂）

```
用户问 → RAG 答 → 用户反馈(👍/👎/纠错) → 写入 feedback 表
                                               │
                                               ▼
                          ┌────────────────────────────┐
                          │ 离线分析（每周一次）          │
                          │  - 高频 👎 query 集中在哪些主题? │
                          │  - 是检索没找到? 还是 LLM 答错? │
                          └────────────┬───────────────┘
                                       │
                ┌──────────────────────┼──────────────────────┐
                ▼                      ▼                      ▼
       检索阶段问题             生成阶段问题            知识库缺失
       → 调 reranker           → 调 prompt            → 补充文档
       → 调 chunk 策略          → 换更强 LLM           → 通知运营补料
                │                      │                      │
                └──────────────────────┴──────────────────────┘
                                       │
                                       ▼
                          补充进 golden set,持续验证
```

#### 2.X.6 你项目里 RAG 该怎么落地（学籍知识库为例）

按以下顺序补齐能力（**先跑通,再做完美**）：

| 周次 | 目标 | 产出物 |
|:--|:--|:--|
| W1 | 跑通主流程 | `app/rag/{loader,splitter,store,retriever}.py` + 第一个能问答的 demo |
| W2 | 加 metadata + 引用溯源 | 答案显示来源文件 + 页码 + 段落 |
| W3 | 加混合检索 + Reranker | 召回率从 70% → 85% |
| W4 | 加 query rewrite + 缓存 | 短问题/口语化问题召回率提升 |
| W5 | 建 golden set + 评估 | 每次改动都有量化结果 |
| W6 | 加反馈闭环 | 用户 👎 进入复盘工单 |
| W7+ | 持续迭代 | 按业务真实反馈调优 |







## Phase 3：LangGraph + Tool + MCP（3-5 天）
**agent和rag的关系**

| 概念  | 本质                                     | 复杂度                         | 框架需求                 |
| :---- | :--------------------------------------- | :----------------------------- | :----------------------- |
| RAG   | 在 Prompt 中塞进相关上下文               | 低（固定流程：检索→拼接→生成） | 不需要框架，几行代码搞定 |
| Agent | 让 LLM自主决定什么时候查什么、调什么工具 | 高（循环、分支、人工介入）     | 需要 LangGraph 这类框架  |

rag只是为了在prompt中带上新的信息和本地信息而已，让chat回答时能更加准确，但是agent则需要要更复杂的框架，同时agent本身也需要rag来提供更准确的prompt；而agent具体来说就是：**Agent = LLM + Tools + State + Loop + 控制**

> Phase 2 RAG：给 LLM 塞资料 -> LLM 写答案
>
> Phase 3 Agent：给 LLM 塞工具 -> LLM 自己决定调什么工具 -> 观察结果 -> 继续决策



Phase 3 知识点树
```
3.1 Tool Calling 基础
    3.1.1 什么是 function calling / tool calling
    3.1.2 LangChain 的 @tool 装饰器
    3.1.3 工具参数的 schema(Pydantic)
    3.1.4 工具的错误处理与重试
    3.1.5 工具的权限与安全边界

3.2 LangGraph 核心概念
    3.2.1 State(状态)
    3.2.2 Node(节点)
    3.2.3 Edge(边) / Conditional Edge(条件边)
    3.2.4 Graph 编译与执行
    3.2.5 Checkpoint(持久化)
    3.2.6 Human-in-the-loop(人工介入)
    3.2.7 Streaming(流式输出)

3.3 经典 Agent 模式
    3.3.1 ReAct(Reasoning + Acting)
    3.3.2 Plan-and-Execute
    3.3.3 Multi-Agent(主管-执行者)
    3.3.4 RAG Agent(RAG + Tool)

3.4 MCP(Model Context Protocol)
    3.4.1 MCP 是什么,解决什么问题
    3.4.2 MCP Server / Client
    3.4.3 常见 MCP Server(filesystem / git / postgres 等)
    3.4.4 在 LangGraph 中接入 MCP

3.5 可观测性与生产化
    3.5.1 Langfuse / LangSmith trace
    3.5.2 Token 成本与延迟统计
    3.5.3 失败重试与降级
    3.5.4 审计日志
```



| 文件                           | 主题                                    | 对应知识点    |
| :----------------------------- | :-------------------------------------- | :------------ |
| `01_tool_basic.py`             | 定义第一个 Tool，让 LLM 调用            | 3.1.1 - 3.1.3 |
| `02_tool_multi.py`             | 多工具 + 错误处理                       | 3.1.4 - 3.1.5 |
| `03_langgraph_hello.py`        | 最小 LangGraph（State + Node + Edge）   | 3.2.1 - 3.2.4 |
| `04_langgraph_conditional.py`  | 条件边与循环                            | 3.2.3 - 3.2.4 |
| `05_react_agent.py`            | ReAct Agent（用 `create_react_agent`）  | 3.3.1         |
| `06_react_from_scratch.py`     | 手写 ReAct 图                           | 3.3.1 + 3.2.* |
| `07_checkpoint_memory.py`      | Checkpoint + 多轮记忆                   | 3.2.5         |
| `08_human_in_the_loop.py`      | 关键动作前人工确认                      | 3.2.6         |
| `09_streaming.py`              | 流式输出 token 和中间步骤               | 3.2.7         |
| `10_rag_agent.py`              | RAG + Tool（把 Phase 2 知识库变成工具） | 3.3.4         |
| `11_plan_and_execute.py`       | 规划 + 执行模式                         | 3.3.2         |
| `12_multi_agent_supervisor.py` | 主管-执行者多 Agent                     | 3.3.3         |
| `13_mcp_client.py`             | 接入一个 MCP Server（filesystem）       | 3.4.*         |
| `14_mcp_in_langgraph.py`       | 在 LangGraph 里把 MCP 工具接入 Agent    | 3.4.4         |
| `15_observability.py`          | Langfuse 集成，看到每一步调用           | 3.5.*         |



```python
# Day 1:Tool Calling
uv run python phase3_agent/01_tool_basic.py
uv run python phase3_agent/02_tool_multi.py

# Day 2:LangGraph 核心
uv run python phase3_agent/03_langgraph_hello.py
uv run python phase3_agent/04_langgraph_conditional.py
uv run python phase3_agent/05_react_agent.py
uv run python phase3_agent/06_react_from_scratch.py

# Day 3:生产能力
uv run python phase3_agent/07_checkpoint_memory.py
uv run python phase3_agent/08_human_in_the_loop.py
uv run python phase3_agent/09_streaming.py

# Day 4:RAG Agent + 高级模式
uv run python phase3_agent/10_rag_agent.py
uv run python phase3_agent/11_plan_and_execute.py
uv run python phase3_agent/12_multi_agent_supervisor.py

# Day 5:MCP + 可观测性
uv run python phase3_agent/13_mcp_client.py
uv run python phase3_agent/14_mcp_in_langgraph.py
uv run python phase3_agent/15_observability.py
```

> 注意：
>
> 13 和 14 需要 Node.js 环境(npx),没有的话可以跳过或改成其他 MCP Server。
> 15 没配 Langfuse 也能跑,只是看不到 trace。
> 10 必须先跑过 Phase 2 的 07_reranker.py,否则向量库是空的。



## Phase 3 知识点深度讲解

> 以下内容结合 `phase3_agent/` 目录下的示例代码,对知识树中的每一个知识点进行深入讲解。
> 目标：读完后你能**自己从零写一个 LangGraph Agent**,并理解生产环境中需要关注的每一环。



### 3.1 Tool Calling 基础

#### 3.1.1 什么是 Function Calling / Tool Calling

**一句话定义**：Tool Calling 是一种**让 LLM 决定"该调用什么函数、传什么参数"**的协议机制。LLM 本身不执行函数,它只是输出一段结构化的 JSON（包含函数名 + 参数），由**你的代码**负责真正执行。

**核心理解**：

传统编程中,调用哪个函数、传什么参数是**程序员在编码时**决定的（硬编码的 if-else 或策略模式）。而 Tool Calling 把这个"决策权"**委托给了 LLM**——LLM 根据用户的自然语言意图,自己选择合适的工具。

**类比 Java**：

```
// 传统方式：程序员硬编码路由
if (userIntent.equals("查GPA"))     service.getGPA(studentId);
if (userIntent.equals("算加法"))    calculator.add(a, b);

// Tool Calling 方式：LLM 来决定路由
// 你只需告诉 LLM："你有这些工具可用"
// LLM 返回：{"name": "getGPA", "args": {"studentId": "2024001"}}
// 你的代码执行这个调用,把结果返回给 LLM
```

**Function Calling vs Tool Calling**：

- `Function Calling` 是 OpenAI 最早引入的叫法（2023.6）,只支持**调一个函数**
- `Tool Calling` 是后来的标准化叫法,支持**一次调多个工具**（parallel tool calls）
- 现在业界统一用 Tool Calling,OpenAI/DeepSeek/Qwen 全部支持

**底层发生了什么?**

```
[你的代码]                        [LLM API]
    |                                 |
    |  1. 发送消息 + tools 列表        |
    |  (每个 tool 的 name/desc/schema) |
    | ─────────────────────────────>  |
    |                                 |
    |  2. LLM 返回 tool_calls        |
    |  [{"name":"add","args":{"a":1}}]|
    | <─────────────────────────────  |
    |                                 |
    |  3. 你执行 add(1,...)           |
    |  4. 把结果作为 ToolMessage 发回  |
    | ─────────────────────────────>  |
    |                                 |
    |  5. LLM 综合结果给最终回复       |
    | <─────────────────────────────  |
```

注意第 2 步：LLM **不执行**函数。它只是说"我想调 add,参数是这些"。第 3 步的执行发生在**你的进程里**。这个设计让你能做权限控制、审计日志、参数校验等——LLM 只是"提建议",你掌握最终执行权。

**对应示例**：`phase3_agent/01_tool_basic.py` 中的 `main()` 完整演示了这个过程：
1. `llm.bind_tools(tools)` → 告诉 LLM 有哪些工具可用
2. `llm_with_tools.invoke(question)` → LLM 返回 `tool_calls`
3. `tool_map[call["name"]].invoke(call["args"])` → 你的代码执行工具

#### 3.1.2 LangChain 的 @tool 装饰器

`@tool` 是 LangChain 提供的**最快速的工具定义方式**。它做了三件事：

1. **从函数签名提取参数 schema**：`a: float, b: float` → JSON Schema `{"a": {"type": "number"}, "b": {"type": "number"}}`
2. **从 docstring 提取工具描述**：这段文字会被发给 LLM,LLM 据此判断什么场景该用这个工具
3. **包装成 `BaseTool` 对象**：可以 `.invoke()`、可以被 `bind_tools()` 接受

**代码示例**（对应 `01_tool_basic.py`）：

```python
from langchain_core.tools import tool

@tool
def get_student_gpa(student_id: str) -> str:
    """根据学号查询学生当前 GPA。学号格式如 2024001。"""
    fake_db = {"2024001": 3.85, "2024002": 3.21}
    if student_id not in fake_db:
        return f"未找到学号 {student_id} 的学生"
    return f"学号 {student_id} 的 GPA 是 {fake_db[student_id]}"
```

**关键要点**：

| 要素 | 作用 | 写好的标准 |
|:--|:--|:--|
| **函数名** | 变成 tool 的 `name`,LLM 会看到 | 用英文、语义清晰,如 `search_policy` 而不是 `sp` |
| **docstring** | LLM 判断"什么时候该用这个工具"的依据 | 明确说**用途场景**和**参数含义**,越具体 LLM 越准 |
| **type hint** | 自动转成 JSON Schema | **必须写**,否则 LLM 不知道参数类型 |
| **返回值** | 最终作为 ToolMessage 发回给 LLM | 建议返回 `str`,内容要对 LLM 有意义 |

**常见错误**：docstring 写太模糊（如"一个工具"）→ LLM 不知道什么时候该调 → 要么不调,要么乱调。

**进阶用法**：你也可以不用装饰器,手动指定 name：

```python
@tool("transfer", args_schema=TransferArgs)
def transfer(from_account: str, to_account: str, amount: float) -> str:
    ...
```

这在 `02_tool_multi.py` 中有演示,当你需要自定义工具名或使用 Pydantic schema 时很有用。



#### 3.1.3 工具参数的 Schema（Pydantic）

当工具参数变得复杂（多个参数、需要校验、需要枚举值约束）时,用 Pydantic 定义 schema 更严谨。

**对应示例**（`02_tool_multi.py`）：

```python
from pydantic import BaseModel, Field

class TransferArgs(BaseModel):
    from_account: str = Field(..., description="转出账户,格式 ACC- 开头")
    to_account: str = Field(..., description="转入账户,格式 ACC- 开头")
    amount: float = Field(..., gt=0, description="金额,必须大于 0")

@tool("transfer", args_schema=TransferArgs)
def transfer(from_account: str, to_account: str, amount: float) -> str:
    ...
```

**Pydantic Schema 做了什么**：

1. **Field description** → 变成 JSON Schema 里每个参数的 `description`,LLM 会读这段话来理解参数含义
2. **Field 约束**（`gt=0`）→ Pydantic 在调用时自动校验,不合法会抛 `ValidationError`
3. **类型约束**（`str` / `float` / `Literal["c","f"]`）→ 告诉 LLM 应该传什么类型

**Java 类比**：Pydantic 就像 Java Bean + JSR 380 校验注解的组合：

```java
public class TransferArgs {
    @NotBlank @Pattern(regexp = "ACC-.*")
    private String fromAccount;
    @Positive
    private double amount;
}
```

**什么时候该用 Pydantic Schema**：
- 参数 > 2 个
- 参数有取值约束（枚举、范围、格式）
- 需要给每个参数加详细 description

**什么时候直接用 @tool 就够**：
- 参数 1-2 个、类型简单
- docstring 已经说清楚了

#### 3.1.4 工具的错误处理与重试

工具调用可能失败（网络错误、参数非法、外部 API 挂了）。你有三种处理策略：

**策略 1：在工具内部返回错误字符串（推荐）**

```python
@tool("transfer", args_schema=TransferArgs)
def transfer(from_account: str, to_account: str, amount: float) -> str:
    if from_account not in ALLOWED_ACCOUNTS:
        return f"错误:账户不在白名单中 ({from_account})"
    if amount > 10000:
        return "错误:单笔金额不得超过 10000"
    return f"成功:从 {from_account} 转 {amount} 元到 {to_account}"
```

LLM 拿到 `"错误:..."` 后,会**理解发生了什么**,可能会换参数重试或告诉用户原因。这是最优雅的方式。

**策略 2：抛异常 + ToolNode 自动捕获**

```python
@tool
def get_weather(city: str) -> str:
    if city == "UNKNOWN":
        raise RuntimeError("天气服务暂时不可用")
    ...
```

在 `02_tool_multi.py` 中,`ToolNode(tools, handle_tool_errors=True)` 会**自动把异常转成 ToolMessage**（内容为错误信息），而不是让整个程序崩溃。

**策略 3：外部重试机制**

对于调用外部 API 的工具,加 tenacity 重试：

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@tool
@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def call_external_api(query: str) -> str:
    response = httpx.get(f"https://api.example.com?q={query}", timeout=5)
    response.raise_for_status()
    return response.text
```

**Java 类比**：策略 1 像在 Service 层 catch 住异常返回 `Result.fail("...")`；策略 2 像全局异常处理器 `@ExceptionHandler`；策略 3 像 Spring Retry 的 `@Retryable`。

**生产建议**：
- 对"预期内的失败"（用户传了无效参数）→ 返回错误字符串（策略 1）
- 对"不可预期的异常"（网络超时）→ 用 `handle_tool_errors=True`（策略 2）+ retry（策略 3）

#### 3.1.5 工具的权限与安全边界

LLM 决定调什么工具——这意味着**如果工具能删数据库,LLM 也可能调**。你必须在工具层面做安全防护。

**核心原则**：Tool 是"武器",LLM 是"士兵"。你不给士兵核弹,他就用不了。

**实践手段**：

| 手段 | 做法 | 对应代码 |
|:--|:--|:--|
| **白名单** | 工具内部校验参数是否在允许范围内 | `02_tool_multi.py` 里的 `ALLOWED_ACCOUNTS` |
| **参数校验** | Pydantic 的 `gt=0`、`max_length` 等约束 | `TransferArgs` 中 `amount: float = Field(..., gt=0)` |
| **只暴露安全工具** | 不把 `delete_database` 这种工具给 LLM | 在 `bind_tools()` 时只传安全的工具列表 |
| **Human-in-the-loop** | 高风险操作前暂停,等人工审批 | `08_human_in_the_loop.py`（3.2.6 详讲） |
| **只读原则** | 能用查询就别用写入;能返回预览就别直接执行 | 例：先返回"即将发送邮件到 xxx",而非直接发 |
| **审计日志** | 记录每次工具调用的 who/when/what/args/result | `15_observability.py`（3.5.4 详讲） |

**生产红线**：
- **永远不要**暴露直接执行 SQL 的工具给 LLM
- 文件操作工具**必须限定目录**（MCP filesystem server 做了这件事）
- 涉及"修改"/"删除"/"发送"的工具,**必须有确认机制**



### 3.2 LangGraph 核心概念

> LangGraph 是 LangChain 团队开发的**有向图状态机**框架,专门用于编排多步骤 Agent。
> 如果说 LangChain 的 LCEL 是"管道"（pipeline）,LangGraph 就是"流程图"（flowchart）——支持分支、循环、并行。
>
> LCEL 和 LangGraph
>
> LCEL(LangChain Expression Language) 是 LangChain 的链式管道语法，用 `|` 符号把多个步骤串成一条流水线。
>
> ```python
> from langchain_core.prompts import ChatPromptTemplate
> from langchain_core.output_parsers import StrOutputParser
> 
> # LCEL 管道：prompt | model | parser
> chain = (
>     ChatPromptTemplate.from_template("回答：{question}")  # 步骤1：构造 Prompt
>     | init_chat_model("deepseek-chat")                  # 步骤2：调 LLM
>     | StrOutputParser()                                 # 步骤3：解析输出
> )
> 
> # 调用（像函数一样）
> result = chain.invoke({"question": "什么是 AI？"})
> ```
>
> LangGraph 是 LangChain 团队开发的有向图状态机，专门用于编排复杂的、有循环的多步骤 Agent。
>
> ```python
> from langgraph.graph import StateGraph, START, END
> 
> class State(TypedDict):
>     messages: Annotated[list[AnyMessage], add_messages]
> 
> graph = StateGraph(State)
> graph.add_node("agent", agent_node)      # 思考节点
> graph.add_node("tools", ToolNode(tools)) # 工具执行节点
> 
> graph.add_edge(START, "agent")
> graph.add_conditional_edges(            # 条件边：实现循环！
>     "agent",
>     should_continue,                    # 函数：决定走哪条路
>     {"tools": "tools", "end": END}
> )
> graph.add_edge("tools", "agent")        # 工具执行完回到 agent
> 
> app = graph.compile()
> ```
>
> 
>
> | 对比     | LCEL                   | LangGraph                      |
> | :------- | :--------------------- | :----------------------------- |
> | 数据流   | 单向管道               | 图结构，可以循环               |
> | 状态     | 隐式传递（上一步输出） | 显式 State 对象                |
> | 循环     | ❌ 不支持               | ✅ 核心能力                     |
> | 人工介入 | ❌ 不支持               | ✅ `interrupt_before`           |
> | 记忆     | 手动管理               | ✅ `checkpointer` 自动管理      |
> | 流式     | `chain.stream()`       | `app.stream()`，能看到每个节点 |
> | 代码量   | 少                     | 稍多                           |
> | 学习成本 | 低                     | 中                             |
>
> *LCEL = 管道（Pipeline），数据单向流动，适合线性流程。*
>
> *LangGraph = 流程图（Flowchart），支持循环、分支、人工介入，专门做 Agent。*



**Java 全局类比**：把 LangGraph 想成 Spring StateMachine + Spring Batch 的结合体：

- State = 全局共享的上下文对象
- Node = 一个 step（函数）
- Edge = 状态转移规则
- Compile = 编译出可执行的状态机
- Checkpoint = 把每一步的状态快照持久化到 DB（Spring Batch 的 JobRepository）

#### 3.2.1 State（状态）

**定义**：State 是整张图所有节点**共享的数据容器**。每个节点读取 State、处理后返回要更新的字段。

**对应示例**（`03_langgraph_hello.py`）：

```python
from typing import TypedDict

class State(TypedDict):
    question: str   # 用户问题（输入）
    draft: str      # 草稿（中间产物）
    answer: str     # 最终答案（输出）
```

**关键理解**：

1. **State 是不可变的**：节点不直接修改 state,而是**返回一个 dict**,LangGraph 框架负责合并。这跟 React 的 `setState` / Redux 的 reducer 思路一样。

```python
def draft_node(state: State) -> dict:
    # 不要 state["draft"] = "xxx"（虽然语法上可以,但不是正确用法）
    # 正确：返回要更新的字段
    return {"draft": f"关于「{state['question']}」的草稿..."}
```

2. **消息列表的特殊处理**：Agent 场景中,State 通常包含 `messages` 字段（对话历史）。LangGraph 提供了 `add_messages` reducer,让新消息**追加**而不是覆盖：

```python
from typing import Annotated
from langgraph.graph.message import add_messages
from langchain_core.messages import AnyMessage

class State(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
```

这里 `Annotated[..., add_messages]` 告诉 LangGraph：当节点返回 `{"messages": [new_msg]}` 时,**把 new_msg 追加到已有列表**,而不是替换整个列表。这对 Agent 的多轮思考至关重要。

3. **State 可以用 Pydantic**：TypedDict 够用,但如果你要运行时校验,可以用 Pydantic BaseModel。

**Java 类比**：State 就像 Spring Batch 的 `ExecutionContext`,或者一个在所有 step 之间传递的 DTO。



#### 3.2.2 Node（节点）

**定义**：Node 是图中的一个处理步骤。本质就是一个函数：`(State) -> dict`（返回要更新的 state 字段）。

**对应示例**（`03_langgraph_hello.py`）：

```python
def draft_node(state: State) -> dict:
    """第一步:写草稿"""
    return {"draft": f"关于「{state['question']}」的草稿回答..."}

def polish_node(state: State) -> dict:
    """第二步:润色"""
    return {"answer": state["draft"] + "(已润色)"}
```

注册节点：

```python
graph = StateGraph(State)
graph.add_node("draft", draft_node)    # 名字 + 函数
graph.add_node("polish", polish_node)
```

**节点可以是什么**：

- 一个普通函数（如上）
- 一个 LLM 调用（Agent 场景最常见）
- 一个 `ToolNode`（预置的工具执行节点,见 `06_react_from_scratch.py`）
- 一个子图（subgraph,用于嵌套复杂流程）

**Agent 场景中的节点**（`06_react_from_scratch.py`）：

```python
def agent_node(state: State) -> dict:
    """思考节点:让 LLM 决定下一步。"""
    ai_msg = LLM.invoke(state["messages"])  # LLM 看完所有历史消息,做决策
    return {"messages": [ai_msg]}            # 追加 LLM 的回复到消息列表
```

这里 `agent_node` 就是一个**让 LLM 思考**的节点。LLM 返回的 `ai_msg` 可能包含 `tool_calls`（想调工具）或纯文本回复（任务完成）。

#### 3.2.3 Edge（边）/ Conditional Edge（条件边）

**普通边（Edge）**：无条件跳转,A 执行完一定跳到 B。

```python
graph.add_edge(START, "draft")      # 图开始 → 进入 draft 节点
graph.add_edge("draft", "polish")   # draft 完成 → 进入 polish 节点
graph.add_edge("polish", END)       # polish 完成 → 图结束
```

**条件边（Conditional Edge）**：根据当前 State 决定跳到哪个节点。**这是 LangGraph 实现循环和分支的核心机制。**

**对应示例**（`04_langgraph_conditional.py`）：

```python
def should_continue(state: State) -> str:
    """条件函数:返回下一个节点名。"""
    if state["counter"] >= 3:
        return "end"
    return "continue"

graph.add_conditional_edges(
    "work",           # 从 work 节点出发
    should_continue,  # 用这个函数决定下一步
    {
        "continue": "work",  # "continue" → 回到 work（循环!）
        "end": END,          # "end" → 结束
    },
)
```

**这就是 ReAct 循环的底层机制**：在 `06_react_from_scratch.py` 中：

```python
def should_continue(state: State) -> str:
    last = state["messages"][-1]
    if getattr(last, "tool_calls", None):  # LLM 还想调工具
        return "tools"
    return "end"  # LLM 不想调了,给出最终回复

graph.add_conditional_edges(
    "agent", should_continue,
    {"tools": "tools", "end": END},
)
graph.add_edge("tools", "agent")  # 工具执行完 → 回到 agent 继续思考
```

这形成了 `agent → tools → agent → tools → ... → END` 的循环,直到 LLM 认为任务完成。

**Java 类比**：普通边 = `@Transactional` 里的顺序调用；条件边 = Spring StateMachine 的 `guard + transition`：

```java
// Spring StateMachine 的等价概念
.withExternal()
    .source(States.AGENT).target(States.TOOLS)
    .guard(ctx -> ctx.hasToolCalls())  // 条件函数
```

#### 3.2.4 Graph 编译与执行

**编译**：`graph.compile()` 把你定义的节点 + 边转成一个可执行的 `CompiledGraph` 对象。

```python
app = graph.compile()                  # 最简编译
app = graph.compile(checkpointer=...)  # 带持久化
app = graph.compile(interrupt_before=["tools"])  # 带人工介入
```

编译后,你可以：
- `app.invoke(input)` → 同步执行整张图,拿到最终 state
- `app.stream(input)` → 流式执行,每个节点完成时输出一次
- `app.ainvoke(input)` / `app.astream(input)` → 异步版本
- `app.get_graph().draw_ascii()` → 打印图的 ASCII 可视化

**执行过程**：

```
invoke({"question": "什么是 Agent?"})
  ↓
START → draft_node(state) → 返回 {"draft": "..."} → state 更新
  ↓
draft → polish_node(state) → 返回 {"answer": "..."} → state 更新
  ↓
polish → END
  ↓
返回最终 state: {"question": "...", "draft": "...", "answer": "..."}
```

**Java 类比**：`compile()` 就像 Spring 容器启动时的 `refresh()`——把 bean 定义编译成可执行的依赖图；`invoke()` 就像处理一个 HTTP 请求。

#### 3.2.5 Checkpoint（持久化）

**问题**：默认情况下,图执行完 state 就丢了。下一次 `invoke()` 是全新的。但**对话场景需要记忆**——用户说了"我叫小明",下一轮应该还记得。

**解决方案**：Checkpointer 在每个节点执行后**自动把 state 快照存下来**。同一个 `thread_id` 的后续调用会自动恢复之前的状态。

**对应示例**（`07_checkpoint_memory.py`）：

```python
from langgraph.checkpoint.memory import MemorySaver

agent = create_react_agent(
    model=llm,
    tools=[remember_fact],
    checkpointer=MemorySaver(),  # 内存存储（适合开发/测试）
)

config = {"configurable": {"thread_id": "user-123"}}

# 第一轮
agent.invoke({"messages": [("user", "我叫小明")]}, config=config)

# 第二轮：同一个 thread_id,Agent 记得你
agent.invoke({"messages": [("user", "我叫什么?")]}, config=config)

# 第三轮：换一个 thread_id,记忆消失
agent.invoke({"messages": [("user", "我叫什么?")]},
             config={"configurable": {"thread_id": "user-999"}})
```

**底层原理**：
1. 每次节点执行完,checkpointer 把完整 state（含所有 messages）序列化存储
2. 下次 invoke 时,框架先根据 `thread_id` 查出最近的 checkpoint
3. 新的 input messages **追加到**已有 messages 后面（因为有 `add_messages` reducer）
4. 从当前节点继续执行

**生产环境**用 PostgreSQL：

```python
from langgraph.checkpoint.postgres import PostgresSaver

checkpointer = PostgresSaver(conn_string="postgresql://...")
agent = create_react_agent(model=llm, tools=tools, checkpointer=checkpointer)
```

**Java 类比**：Checkpointer = Spring Session + 数据库。`thread_id` = `JSESSIONID`。每一步保存的 state 就像 `HttpSession.setAttribute()`。

**什么时候需要 Checkpoint**：

- 多轮对话（必须）
- 需要跨请求恢复的长任务
- Human-in-the-loop（暂停/恢复）

#### 3.2.6 Human-in-the-loop（人工介入）

**场景**：LLM 要执行高风险操作（发邮件、删数据、审批通过）时,你希望**先暂停,让人确认,再继续**。

**对应示例**（`08_human_in_the_loop.py`）：

```python
agent = create_react_agent(
    model=llm,
    tools=[send_email],
    checkpointer=MemorySaver(),
    interrupt_before=["tools"],  # 在 tools 节点执行前暂停
)

config = {"configurable": {"thread_id": "approval-1"}}

# 第一阶段：LLM 决定要调工具,但图在 tools 前暂停了
for chunk in agent.stream(
    {"messages": [("user", "帮我给 teacher@school.edu 发请假邮件")]},
    config=config,
):
    print(chunk)

# 查看 LLM 想做什么
snapshot = agent.get_state(config)
print(snapshot.values["messages"][-1].tool_calls)
# → [{"name": "send_email", "args": {"to": "teacher@school.edu", ...}}]

# 人工审核通过,继续执行
for chunk in agent.stream(None, config=config):  # input=None 表示"继续"
    print(chunk)
```

>  `tream` vs `invoke` 的区别
>
> 不只是"字符逐个返回"！`stream` 的核心价值是看到**中间节点**的输出。
>
> | 方法     | 返回                                        | 适合场景                          |
> | :------- | :------------------------------------------ | :-------------------------------- |
> | `invoke` | 最终结果（所有节点执行完的完整 state）      | 简单调用，不关心过程              |
> | `stream` | 逐个节点返回，每个 chunk 包含当前节点的更新 | 需要看 LLM 思考过程、人工介入审批 |
>
> 输出对比：
>
> ```python
> # invoke - 只返回最终结果
> result = agent.invoke({"messages": [...]}, config=config)
> # 等待所有节点执行完，一次性返回
> 
> # stream - 逐步返回每个节点
> for chunk in agent.stream({"messages": [...]}, config=config):
>     # chunk 可能是：
>     # {"agent": {"messages": [AIMessage(content="", tool_calls=[...])]}}  ← LLM 想调工具
>     # 然后暂停！
>     print(chunk)
> ```
>
> 在 HITL （human in the loop）场景下，`stream` 是必须的——它让你能在暂停点捕获状态，给人看，等人批准后再继续。

**关键机制**：

1. `interrupt_before=["tools"]` → 图在执行 `tools` 节点**之前**暂停
2. 暂停时 state 被 checkpoint 保存（所以需要 checkpointer）
3. 你可以 `agent.get_state(config)` 查看当前状态（LLM 想调什么工具）
4. 审核通过 → `agent.stream(None, config)` 继续；不通过 → 可以修改 state 后继续,或直接结束

**也可以在节点之后暂停**：`interrupt_after=["tools"]`——工具执行完了,让人看看结果,再决定要不要继续。

**生产典型流程**：

```
用户提问 → Agent 思考 → 决定调 send_email
   → 暂停 → 前端弹窗 "Agent 想发邮件到 xxx,确认?"
   → 用户点「确认」→ 前端调 API → 后端 agent.stream(None, config)
   → 工具执行 → Agent 回复 "邮件已发送"
```

**Java 类比**：这就像 Activiti/Camunda 工作流引擎里的**UserTask**——流程到这里暂停,等人处理完再往下走。

#### 3.2.7 Streaming（流式输出）

**为什么需要流式**：LLM 生成文本很慢（几百毫秒到几秒），如果等全部生成完再返回,用户体验很差。流式输出让用户**看到文字一个一个蹦出来**（打字机效果）。

**两种粒度的流式**（对应 `09_streaming.py`）：

**粒度 1：节点级流式（stream）**

每个节点执行完输出一次。适合展示 Agent 的"思考过程"。

```python
for chunk in agent.stream(
    {"messages": [("user", "搜一下 AI 最新新闻")]},
    stream_mode="updates",  # "updates" 只输出变化的部分
):
    for node, update in chunk.items():
        print(f"[{node}]")
        for msg in update.get("messages", []):
            msg.pretty_print()
```

输出类似：
```
[agent]     → LLM 决定调 search_news
[tools]     → search_news 返回结果
[agent]     → LLM 根据结果总结回复
```

**粒度 2：Token 级流式（astream_events）**

每个 token 生成时就输出。用于前端打字机效果。

```python
async for event in agent.astream_events(
    {"messages": [("user", "搜一下 AI 最新新闻")]},
    version="v2",
):
    if event["event"] == "on_chat_model_stream":
        content = event["data"]["chunk"].content
        if content:
            print(content, end="", flush=True)
```

**生产中的用法**：

```python
# FastAPI SSE 端点
from fastapi.responses import StreamingResponse

@app.post("/api/v1/chat/stream")
async def chat_stream(req: ChatRequest):
    async def event_generator():
        async for event in agent.astream_events(...):
            if event["event"] == "on_chat_model_stream":
                chunk = event["data"]["chunk"].content
                if chunk:
                    yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

**stream_mode 选项**：
- `"values"` → 每步输出完整 state（适合调试）
- `"updates"` → 每步只输出变化部分（适合生产）
- `"messages"` → 只输出消息（最常用）

---

### 3.3 经典 Agent 模式

> Agent = LLM + Tools + State + Loop + 控制。
> 不同的"控制方式"形成了不同的 Agent 模式。以下是生产中最常用的四种。

#### 3.3.1 ReAct（Reasoning + Acting）

**论文**：Yao et al., 2022, "ReAct: Synergizing Reasoning and Acting in Language Models"

**核心思想**：LLM 交替进行**推理**（Thought）和**行动**（Action），每次行动后**观察**结果（Observation），再决定下一步。

**循环**：

```
Thought:  用户想查 GPA,我需要调 get_student_gpa 工具
Action:   get_student_gpa(student_id="2024001")
Observation: 学号 2024001 的 GPA 是 3.85
Thought:  用户还要算加法,我需要调 add 工具
Action:   add(a=3.85, b=0.2)
Observation: 4.05
Thought:  两个任务都完成了,我来总结
Answer:   2024001 的 GPA 是 3.85,加上 0.2 后是 4.05
```

**LangGraph 实现方式 1：用预置的 `create_react_agent`**（`05_react_agent.py`）：

```python
from langgraph.prebuilt import create_react_agent

agent = create_react_agent(
    model=llm,
    tools=[search_policy, get_current_date],
    prompt="你是高校学籍助手,回答时尽量引用规定原文。",
)

result = agent.invoke({
    "messages": [("user", "今天几号?另外帮我查一下休学和转专业的规定。")]
})
```

一行代码搞定。`create_react_agent` 内部自动搭建了 `agent → tools → agent` 的循环图。适合 **90% 的单 Agent 场景**。

**LangGraph 实现方式 2：手写 ReAct 图**（`06_react_from_scratch.py`）：

```python
graph = StateGraph(State)
graph.add_node("agent", agent_node)       # LLM 思考
graph.add_node("tools", ToolNode(TOOLS))  # 执行工具

graph.add_edge(START, "agent")
graph.add_conditional_edges(
    "agent", should_continue,
    {"tools": "tools", "end": END},
)
graph.add_edge("tools", "agent")  # 工具执行完 → 回到 agent 继续思考

app = graph.compile()
```

手写的好处：
- 你可以在 `agent_node` 里加自定义逻辑（比如限制最大循环次数）
- 你可以加更多节点（如 "validator" 节点在工具执行前校验参数）
- 你完全理解了 Agent 的底层结构

**ReAct 图的可视化**：

```
          ┌──────────────────┐
          │      START       │
          └────────┬─────────┘
                   ↓
          ┌──────────────────┐
     ┌──→ │   agent (LLM)    │ ──→ 没有 tool_calls → END
     │    └────────┬─────────┘
     │             ↓ 有 tool_calls
     │    ┌──────────────────┐
     └─── │   tools (执行)    │
          └──────────────────┘
```

**ReAct 的优缺点**：
- 优点：灵活、通用,LLM 可以随时调整策略
- 缺点：每一步都要调 LLM（贵 + 慢）,步骤多时容易"跑偏"
- 适合：步骤不超过 5-10 步的任务

#### 3.3.2 Plan-and-Execute

**解决的问题**：ReAct 是"走一步看一步",步骤多时 LLM 容易忘记全局目标或陷入死循环。Plan-and-Execute **先规划再执行**。

**核心思想**：
1. **Planner**：LLM 一次性把任务拆成 2-5 个步骤
2. **Executor**：逐个执行每个步骤（每步可以是一个小 ReAct Agent）
3. **（可选）Replanner**：执行几步后回头看看,要不要调整计划

**对应示例**（`11_plan_and_execute.py`）：

```python
class PlanState(TypedDict):
    input: str                           # 原始问题
    plan: list[str]                      # 待执行的步骤列表
    past_steps: list[tuple[str, str]]    # 已完成的步骤和结果
    response: str                        # 最终回复

def planner_node(state: PlanState) -> dict:
    """让 LLM 把任务拆成步骤。"""
    msg = (PLANNER_PROMPT | llm).invoke({"input": state["input"]})
    steps = [line.strip() for line in str(msg.content).splitlines() if line.strip()]
    return {"plan": steps, "past_steps": []}

def execute_step_node(state: PlanState) -> dict:
    """取出 plan 的第一步,用小 ReAct Agent 执行。"""
    current_step = state["plan"][0]
    result = executor.invoke(
        {"messages": [("user", f"请执行以下任务:{current_step}")]}
    )
    return {
        "past_steps": state["past_steps"] + [(current_step, str(result))],
        "plan": state["plan"][1:],  # 去掉已执行的步骤
    }

def should_continue(state: PlanState) -> str:
    return "execute" if state["plan"] else "summarize"
```

图的结构：

```
START → planner → execute ←──┐
                    │         │
                    ↓ plan 还有步骤?
                   是 ────────┘
                   否 → summarize → END
```

**vs ReAct 的对比**：

| 维度 | ReAct | Plan-and-Execute |
|:--|:--|:--|
| 决策频率 | 每步都让 LLM 决策 | 先规划一次,执行时按计划走 |
| LLM 调用次数 | 多（每步 thought + action） | 少（一次规划 + 每步执行） |
| 灵活性 | 高（随时调整） | 中（需要 replan 才能调整） |
| 适合场景 | 步骤少、探索性强 | 步骤多、目标明确 |
| 成本 | 高 | 较低 |

**生产建议**：先用 ReAct；如果发现 Agent 经常跑偏或步骤太多太慢,换 Plan-and-Execute。

#### 3.3.3 Multi-Agent（主管-执行者）

**解决的问题**：单 Agent 工具太多时,LLM 容易选错工具。把不同领域的工具**分给不同的专家 Agent**,由一个 **Supervisor（主管）**统一调度。

**对应示例**（`12_multi_agent_supervisor.py`）：

```
                    ┌─────────────────┐
          ┌────────│   Supervisor     │────────┐
          │        │  (决定派给谁)     │        │
          │        └──────┬──────────┘        │
          ↓               │ FINISH             ↓
  ┌───────────────┐       ↓            ┌───────────────┐
  │  Researcher   │      END           │    Writer     │
  │ (搜索资料)     │                    │ (写文章)       │
  └───────┬───────┘                    └───────┬───────┘
          │                                    │
          └──────────── 回到 Supervisor ────────┘
```

**三个核心角色**：

1. **Supervisor（主管）**：一个专门做路由的 LLM 调用。它看到当前对话后,决定派给哪个 Worker,或者说"任务完成"。

```python
SUPERVISOR_SYSTEM = (
    "你是主管,根据对话决定下一步派给谁。\n"
    "可选:researcher / writer / FINISH。\n"
    "只输出一个词。"
)

def supervisor_node(state: State) -> dict:
    msg = llm.invoke([("system", SUPERVISOR_SYSTEM)] + state["messages"])
    decision = str(msg.content).strip().lower()
    if "research" in decision:
        return {"next": "researcher"}
    if "writ" in decision:
        return {"next": "writer"}
    return {"next": "FINISH"}
```

2. **Worker（执行者）**：每个 Worker 是一个独立的 Agent（可以有自己的工具）。

```python
researcher = create_react_agent(
    model=llm, tools=[web_search],
    prompt="你是研究员,只负责搜集事实和资料。",
)
writer = create_react_agent(
    model=llm, tools=[],
    prompt="你是写作者,基于给定资料写出文章。",
)
```

3. **路由逻辑**：Supervisor 的决策通过条件边来实现。

```python
graph.add_edge(START, "supervisor")
graph.add_conditional_edges("supervisor", route)
graph.add_edge("researcher", "supervisor")  # 执行完回到 Supervisor
graph.add_edge("writer", "supervisor")
```

**适合场景**：
- 工具数量多（> 10 个）,单 Agent 选不准
- 任务领域跨度大（如：研究 + 写作 + 代码 + 数据分析）
- 需要不同 Agent 用不同的 LLM（如便宜模型做研究,贵模型做写作）

**vs 单 Agent 的取舍**：
- 单 Agent 工具 ≤ 5 个 → 用 ReAct 就够
- 工具 > 5 个或跨领域 → 考虑 Multi-Agent
- Multi-Agent 的额外成本：Supervisor 的每次路由也要调 LLM

#### 3.3.4 RAG Agent（RAG + Tool）

**解决的问题**：Phase 2 的 RAG 是"**固定流程**"——用户提问 → 检索 → 生成。但有时用户的问题**不需要检索**（如"今天几号"），或者**需要多次检索**（如"对比 A 和 B 两个制度"）。RAG Agent 让 LLM **自己决定**什么时候查知识库。

**对应示例**（`10_rag_agent.py`）：

核心：把向量检索**封装成一个 tool**,让 LLM 自主调用。

```python
@tool
def search_knowledge_base(query: str) -> str:
    """在学籍管理规定知识库中搜索。当用户问制度、规定、流程相关问题时使用。"""
    docs = get_store().similarity_search(query, k=3)
    if not docs:
        return "未找到相关内容"
    return "\n\n".join(
        f"[片段 {i+1}]\n{d.page_content}" for i, d in enumerate(docs)
    )

agent = create_react_agent(
    model=llm,
    tools=[search_knowledge_base, calculate_gpa],
    prompt=(
        "你是高校学籍助手。\n"
        "- 遇到规章制度问题,必须先调用 search_knowledge_base 查原文。\n"
        "- 遇到计算问题,调用 calculate_gpa。\n"
        "- 回答要引用原文片段,不要臆造。"
    ),
)
```

**RAG Agent vs 传统 RAG 对比**：

| 维度 | 传统 RAG（Phase 2） | RAG Agent（Phase 3） |
|:--|:--|:--|
| 检索时机 | 每次都检索 | LLM 决定要不要检索 |
| 检索次数 | 固定 1 次 | LLM 可能检索多次（不同关键词） |
| 混合能力 | 只能 RAG | 可以 RAG + 其他工具（计算、API 调用） |
| 复杂度 | 低 | 中 |
| 成本 | 低（1 次 LLM） | 高（多次 LLM + 工具） |

**最佳实践**：在 prompt 中明确告诉 LLM "什么情况必须先查知识库",否则 LLM 可能自作聪明直接回答（编造）。



### 3.4 MCP（Model Context Protocol）

#### 3.4.1 MCP 是什么,解决什么问题

**一句话**：MCP 是 **Tool 的 USB 标准**——不管你的工具是 Python 写的、Java 写的、还是 Node.js 写的,只要暴露成 MCP Server,任何 Agent 框架都能调用。

**解决的核心问题**：

```
没有 MCP 之前:
  LangChain Agent → 只能用 LangChain @tool 定义的工具
  AutoGen Agent  → 只能用 AutoGen 格式的工具
  自研 Agent    → 又得写一套工具格式

  Java 后端的 student.find → 每个 Agent 框架都要写一个适配器

有了 MCP:
  Java 后端 → 暴露 MCP Server（student.find / notice.send）
  LangChain Agent → 通过 MCP Client 直接调用
  Cursor Agent   → 通过 MCP Client 直接调用
  任何 Agent     → 通过 MCP Client 直接调用
```

**类比**：
- MCP **之于 AI 工具** = REST API 之于 Web 服务 = JDBC 之于数据库
- MCP Server = 暴露 API 的微服务
- MCP Client = 调用 API 的 SDK
- MCP 协议 = HTTP + JSON Schema 的等价物（但专门为 LLM 工具调用设计）

**MCP 协议定义了什么**：
1. **工具发现**：`tools/list` → 客户端问"你有哪些工具?",服务端返回列表（name + description + 参数 schema）
2. **工具调用**：`tools/call` → 客户端说"请执行 add(a=1, b=2)",服务端返回结果
3. **资源暴露**：`resources/list` → 服务端可以暴露静态资源（文件、数据库 schema 等）
4. **Prompt 模板**：`prompts/list` → 服务端可以提供预置 prompt

**为什么这对你的项目重要**：你的架构是 Python AI 端 + Java 后端。Java 后端暴露 MCP Server（`student.find`, `notice.send`），Python 端通过 MCP Client 接入 → AI Agent 就能调用 Java 的业务逻辑。这是**最干净的架构**。

#### 3.4.2 MCP Server / Client

**MCP Server**：暴露工具的一方。

**对应示例**（`phase3_agent/mcp_server_demo.py`）：

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("LearnMCP", host="127.0.0.1", port=8765, json_response=True)

@mcp.tool()
def add(a: int, b: int) -> int:
    """两数相加。"""
    return a + b

@mcp.tool()
def lookup_student(student_no: str) -> dict:
    """按学号查询学生信息。"""
    return _FAKE_STUDENTS.get(student_no, {})

if __name__ == "__main__":
    mcp.run(transport="streamable-http")  # 监听 HTTP,最贴近生产
```

注意：`@mcp.tool()` 跟 LangChain 的 `@tool` 非常像——从函数签名 + docstring 自动生成 JSON Schema。但它生成的是**MCP 协议格式**,任何 MCP Client 都能调用。

**MCP Client**：调用工具的一方。

**对应示例**（`06_mcp_agent.py`）：

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

async with MultiServerMCPClient({
    "learn": {
        "url": "http://127.0.0.1:8765/mcp",
        "transport": "streamable_http",
    },
}) as client:
    tools = client.get_tools()  # 自动调 tools/list,拿到工具列表
    # tools 已经是 LangChain BaseTool 格式,可以直接给 Agent 用
```

> 注意：
>
> mcp就是暴露tool功能的标准通信协议，并且client方可以直接获取到暴露的tool列表，不需要指定去调用哪一个，而是可以直接获取到client.get_tools()，自己分析tools中每个tool的功能描述，自己决定怎么调哪个。
>
> ```
> ┌─────────────────────────────────────────────────────────────┐
> │  MCP Server 暴露工具                                          │
> │  - 提供工具列表（name + description + 参数 schema）           │
> │  - 提供调用接口（tools/call）                                 │
> └────────────────────────┬──────────────────────────────────────┘
>                          │ ① 自动发现
>                          ▼
> ┌─────────────────────────────────────────────────────────────┐
> │  Python AI 侧                                                │
> │  client.get_tools() → 拿到 [tool1, tool2, tool3]            │
> │       ↓                                                      │
> │  交给 Agent → LLM 自己读 description → 决定调哪个              │
> │       ↓                                                      │
> │  不需要你写死调用哪个！                                       │
> └─────────────────────────────────────────────────────────────┘
> ```
>
> 这样就是为什么需要拆分多个专家agent的原因：
>
> - LLM 上下文有限（Tool 描述占 Token）
> - 工具描述相似时容易混淆（`lookup_student` vs `search_policy`）
> - 选项越多，决策质量越低（和人类一样），tools一个多一般超过10，选错tool的概率就会陡增



**传输方式（Transport）**：

| Transport | 场景 | 特点 |
|:--|:--|:--|
| `stdio` | 本地进程通信 | Server 作为子进程启动,通过 stdin/stdout 通信。适合 CLI 工具（如 filesystem server） |
| `streamable-http` | 远程/跨机器 | Server 监听 HTTP 端口。**生产推荐**,最接近微服务架构 |
| `sse` | 旧版远程 | Server-Sent Events,已被 streamable-http 替代 |

**Java 端要做的事**：用 Spring Boot + MCP Java SDK 暴露 MCP Server（`spring-ai-mcp-server`），Python 端用 `MultiServerMCPClient` 连接。URL 从 `mcp_server_demo.py` 的 `127.0.0.1:8765` 换成 `127.0.0.1:8080/mcp`。

#### 3.4.3 常见 MCP Server（filesystem / git / postgres 等）

MCP 生态已经有大量现成的 Server,可以直接拿来用：

| Server | 能力 | 安装方式 |
|:--|:--|:--|
| `@modelcontextprotocol/server-filesystem` | 读写文件、列目录 | `npx -y @modelcontextprotocol/server-filesystem /path` |
| `@modelcontextprotocol/server-postgres` | 查询 PostgreSQL（只读） | `npx -y @modelcontextprotocol/server-postgres $PG_URL` |
| `@modelcontextprotocol/server-github` | 读 PR/Issue/代码 | 需要 GitHub Token |
| `@modelcontextprotocol/server-git` | Git 操作 | 需要 Git 仓库路径 |
| 自己写的 MCP Server | 任何业务逻辑 | Python: `FastMCP`; Java: `spring-ai-mcp-server` |

**对应示例**（`13_mcp_client.py`）——连接 filesystem MCP Server：

```python
client = MultiServerMCPClient({
    "filesystem": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", data_dir],
        "transport": "stdio",  # 通过子进程通信
    }
})

tools = await client.get_tools()
# 得到: read_file, write_file, list_directory, ...
```

**你的项目会用到**：
1. 自己写的 Java MCP Server（核心业务工具）
2. 可能加 `server-postgres`（让 Agent 直接查数据库,但要注意权限）
3. 可能加 `server-filesystem`（让 Agent 读取上传的文件）

#### 3.4.4 在 LangGraph 中接入 MCP

**核心**：`langchain-mcp-adapters` 把 MCP 工具**自动转换成 LangChain BaseTool**。之后你就像用普通 `@tool` 一样把它们给 Agent。

**对应示例**（`14_mcp_in_langgraph.py`）：

```python
# 1. MCP 工具
mcp_tools = await client.get_tools()

# 2. 本地工具
@tool
def word_count(text: str) -> int:
    """统计文本字符数(本地工具)。"""
    return len(text)

# 3. 混合使用——MCP 工具和本地工具可以混在一起
all_tools = [*mcp_tools, word_count]

# 4. 交给 Agent
agent = create_react_agent(model=llm, tools=all_tools)
```

**关键点**：

- MCP 工具和 `@tool` 定义的本地工具**完全等价**,可以混用
- `MultiServerMCPClient` 支持同时连接**多个 MCP Server**
- 生命周期用 `async with` 管理（确保连接正确关闭）

**生产环境封装模式**：

```python
# app/tools/mcp_client.py
from contextlib import asynccontextmanager

@asynccontextmanager
async def get_mcp_tools():
    async with MultiServerMCPClient({
        "business": {
            "url": "http://java-backend:8080/mcp",
            "transport": "streamable_http",
        },
        "filesystem": {
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"],
            "transport": "stdio",
        },
    }) as client:
        yield client.get_tools()

# FastAPI lifespan 里初始化
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with get_mcp_tools() as tools:
        app.state.mcp_tools = tools
        yield
```



### 3.5 可观测性与生产化

> Agent 不是写完就完了。生产环境中你必须回答：
> - 它刚才做了什么？调了几次工具？传了什么参数？
> - 花了多少 token？成本多少？
> - 为什么失败了？哪一步出的问题？
> - 是不是某个用户在滥用？

#### 3.5.1 Langfuse / LangSmith Trace

**Trace（调用链）** 是可观测性的核心概念：一次用户请求产生的**所有 LLM 调用、工具调用、中间步骤**形成一棵树。

```
Trace: "休学最多几年?"
├── Generation: LLM 思考 → 决定调 search_policy
│   ├── Input: [HumanMessage("休学最多几年?")]
│   ├── Output: AIMessage(tool_calls=[{name: "search_policy", args: {keyword: "休学"}}])
│   ├── Tokens: 150 input + 30 output
│   └── Latency: 800ms
├── Span: search_policy("休学")
│   ├── Result: "每次不超过一年,累计不超过两年。"
│   └── Latency: 2ms
└── Generation: LLM 总结回复
    ├── Input: [HumanMessage, AIMessage, ToolMessage]
    ├── Output: "根据规定,休学每次不超过一年..."
    ├── Tokens: 200 input + 80 output
    └── Latency: 1200ms
```

**Langfuse** 和 **LangSmith** 是两个主流的可观测性平台：

| 维度 | Langfuse | LangSmith |
|:--|:--|:--|
| 开源 | 是（可自托管） | 否（SaaS） |
| 接入方式 | `CallbackHandler` | `LANGCHAIN_TRACING_V2=true` 环境变量 |
| 适合 | 对数据主权敏感、想自建 | 快速上手、用 LangChain 全家桶 |
| 费用 | 自托管免费 | 有免费额度,超了付费 |

**对应示例**（`15_observability.py`）：

```python
from langfuse.callback import CallbackHandler

callbacks = [CallbackHandler(
    public_key=os.environ["LANGFUSE_PUBLIC_KEY"],
    secret_key=os.environ["LANGFUSE_SECRET_KEY"],
    host=os.getenv("LANGFUSE_HOST", "https://cloud.langfuse.com"),
)]

result = agent.invoke(
    {"messages": [("user", "休学最多几年?")]},
    config={
        "callbacks": callbacks,
        "metadata": {"user_id": "demo-user", "session": "phase3-obs"},
        "tags": ["phase3", "demo"],
    },
)
```

**关键**：`config` 里的 `metadata` 和 `tags` 会被记录到 trace 中,方便你按用户、按功能筛选。

**Java 类比**：Langfuse 之于 Agent = Zipkin/Jaeger 之于微服务。都是分布式追踪,只不过追踪对象从 HTTP 调用变成了 LLM 调用。

#### 3.5.2 Token 成本与延迟统计

**为什么重要**：LLM API 按 token 计费。一个复杂的 Multi-Agent 任务可能调 LLM 10+ 次,不监控的话账单会失控。

**在 Langfuse 中看到的数据**：

- 每次 LLM 调用的 `input_tokens` / `output_tokens` / `total_tokens`
- 根据模型单价自动计算费用（需要在 Langfuse 里配置模型价格）
- 每个节点的延迟（`latency_ms`）
- 整条 trace 的总延迟

**代码层面获取 token 用量**：

```python
result = llm.invoke("你好")
print(result.usage_metadata)
# → {'input_tokens': 5, 'output_tokens': 20, 'total_tokens': 25}
```

**生产建议**：
- 设置**每用户每天的 token 上限**,超了就降级或拒绝
- 监控**平均每次请求的 token 数**,如果突然飙升说明 prompt 或 Agent 逻辑有问题
- DeepSeek 很便宜（约 1 元 / 百万 token）,但多 Agent 场景下也会积少成多

#### 3.5.3 失败重试与降级

**Agent 可能失败的环节**：

| 环节 | 失败原因 | 处理 |
|:--|:--|:--|
| LLM API 调用 | 限流(429)、超时、API 挂了 | 重试 + 降级到备用模型 |
| 工具执行 | 外部 API 失败、参数错误 | 工具内重试 + 返回错误字符串 |
| Agent 死循环 | LLM 反复调同一个工具 | 设置 `recursion_limit` |
| 输出解析失败 | LLM 返回格式不对 | 重试 + 给 LLM 更明确的格式指令 |

**关键配置**：

```python
# 1. 限制最大循环次数（防死循环）
app = graph.compile()
result = app.invoke(input, config={"recursion_limit": 25})  # 默认 25

# 2. LLM 层面的重试（LangChain 内置）
llm = init_chat_model(
    "deepseek-chat",
    max_retries=3,          # API 失败时自动重试
    request_timeout=30,     # 超时时间
)

# 3. 降级策略
try:
    result = primary_agent.invoke(input)
except Exception:
    result = fallback_agent.invoke(input)  # 用备用模型/简化 Agent
```

**生产建议**：
- `recursion_limit` 设为 25-50（根据任务复杂度）
- LLM API 做**指数退避重试**（LangChain 默认就做了）
- 有条件的话配两个模型（主用 DeepSeek,备用 Qwen）

#### 3.5.4 审计日志

**为什么需要审计**：你的 Agent 能调用业务工具（查学生信息、发通知）。你必须知道**谁在什么时候让 Agent 做了什么**。

**最小审计方案**（利用 Langfuse）：

```python
config = {
    "callbacks": [langfuse_handler],
    "metadata": {
        "user_id": "u_001",         # 谁
        "session_id": "s_abc123",   # 哪个会话
        "ip": "192.168.1.100",      # 来自哪里
    },
    "tags": ["production", "student-agent"],
}

result = agent.invoke({"messages": [...]}, config=config)
```

在 Langfuse 控制台中,你可以：
- 按 `user_id` 筛选,看某个用户的所有操作
- 按 `tags` 筛选,看某个功能模块的使用情况
- 点进 trace,看到完整的调用链（LLM 想调什么工具、传了什么参数、结果是什么）

**进阶审计方案**（独立日志）：

```python
import structlog

logger = structlog.get_logger()

@tool
def transfer(from_account: str, to_account: str, amount: float) -> str:
    logger.info("tool_invoked",
        tool="transfer",
        args={"from": from_account, "to": to_account, "amount": amount},
        user_id=get_current_user_id(),
    )
    # ... 执行转账 ...
    logger.info("tool_completed", tool="transfer", result="success")
    return "转账成功"
```

**Java 类比**：审计日志 = Spring AOP 的方法拦截 + 操作日志表。在微服务里你用 `@Audit` 注解,在 Agent 里你用 Langfuse metadata + 工具内日志。

---

> **Phase 3 小结**：
>
> 到这里你应该理解了 Agent 的完整知识体系：
> 1. **Tool Calling** 是基础——让 LLM 决定调什么工具
> 2. **LangGraph** 是骨架——State + Node + Edge 编排多步骤流程
> 3. **ReAct / Plan-and-Execute / Multi-Agent** 是模式——不同场景选不同架构
> 4. **MCP** 是连接层——让你的 Java 后端工具能被任何 Agent 调用
> 5. **可观测性** 是生产保障——没有 trace 就别上线
>
> 接下来跑一遍 `phase3_agent/` 的示例代码,然后回到下面的学习资源和动手指南。

---

### 3.6 生产级 Agent 完整能力清单（从 Demo 到生产必做的事）

> Demo 级 Agent 只需要 `create_react_agent(model, tools)` 一行代码,但**生产级 Agent 需要 15+ 个能力点**。下表逐项展开,你可以当作"实施 checklist"按优先级补齐。

#### 3.6.1 完整能力地图

| # | 能力 | 解决的问题 | Demo 必做? | 生产必做? | 推荐技术栈/文件 |
|:--|:--|:--|:--:|:--:|:--|
| **1** | **Tool 设计与封装** | 用 `@tool` / Pydantic 定义稳定的工具接口 | ✅ | ✅ | `01_tool_basic.py` / `02_tool_multi.py` |
| **2** | **Tool 错误处理** | 工具失败不能让 Agent 整个崩溃 | ⚠️ | ✅ | `ToolNode(handle_tool_errors=True)` |
| **3** | **Tool 权限控制** | 不同角色能调用不同工具 | ❌ | ✅ | 在 Agent 入口按 user_role 注入 tools 列表 |
| **4** | **Tool 参数校验** | Pydantic Schema + 业务白名单 | ⚠️ | ✅ | `02_tool_multi.py` `TransferArgs` |
| **5** | **MCP Server 接入** | 跨语言/跨进程的工具协议 | ❌ | ✅ | `langchain-mcp-adapters` + Java MCP Server |
| **6** | **状态管理** | State + Checkpoint 持久化 | ❌ | ✅ | `PostgresSaver`(生产) / `MemorySaver`(开发) |
| **7** | **多轮记忆 / Session** | 用 thread_id 串起多轮对话 | ❌ | ✅ | `07_checkpoint_memory.py` |
| **8** | **长期记忆** | 跨 session 的用户偏好/历史 | ❌ | ⚠️ | `langgraph-memory` / 自建 PG 表 |
| **9** | **流式输出** | SSE / WebSocket 推送中间步骤 + token | ❌ | ✅ | `09_streaming.py` + FastAPI SSE |
| **10** | **Human-in-the-loop** | 高风险动作前人工审批 | ❌ | ✅ | `08_human_in_the_loop.py` `interrupt_before` |
| **11** | **失败重试与降级** | LLM/Tool 偶发失败的兜底 | ❌ | ✅ | `tenacity` + 备用模型 + `recursion_limit` |
| **12** | **超时控制** | 防止 Agent 卡死 | ❌ | ✅ | `request_timeout` + Agent 级超时 |
| **13** | **死循环保护** | 限制最大循环次数 | ❌ | ✅ | `config={"recursion_limit": 25}` |
| **14** | **并发控制** | 防止单用户打满 LLM 配额 | ❌ | ✅ | `asyncio.Semaphore` + 用户级限流 |
| **15** | **Token / 成本控制** | 长 messages 截断、按用户配额 | ❌ | ✅ | `trim_messages` + 配额表 |
| **16** | **Prompt 注入防护** | 用户输入 / RAG context 中的攻击 | ❌ | ✅ | 输入过滤 + 系统消息隔离 + 输出审核 |
| **17** | **输出安全** | 敏感词、隐私脱敏、内容审核 | ❌ | ✅ | 自建审核词库 / 第三方内容审核 API |
| **18** | **可观测性 (Trace)** | 全链路追踪每一次调用 | ❌ | ✅ | `15_observability.py` Langfuse |
| **19** | **审计日志** | who / when / what tool / args / result | ❌ | ✅ | structlog + 审计表 + Langfuse metadata |
| **20** | **沙箱隔离** | 代码执行/文件操作不能伤害宿主 | ❌ | 视场景 | Docker / `restrictedpython` / E2B |
| **21** | **任务队列 (异步执行)** | 长任务不阻塞用户请求 | ❌ | ⚠️ | Celery / RQ / Redis Stream |
| **22** | **Agent 评估** | 工具选择准确率 / 任务完成率 | ❌ | ✅ | LangSmith Evaluators / 自建 case 集 |
| **23** | **A/B 测试与灰度** | 新版本 prompt/工具上线前小流量验证 | ❌ | ⚠️ | 配置中心 + traffic split |
| **24** | **多租户隔离** | SaaS 场景下用户/部门数据隔离 | ❌ | 视场景 | thread_id 命名空间 + Row-Level Security |
| **25** | **反馈闭环** | 用户 👍/👎 / 修正 → 持续优化 | ❌ | ✅ | feedback 表 + 离线分析 + Prompt 迭代 |

**图例**：✅ 必做 / ⚠️ 视场景 / ❌ 可选

#### 3.6.2 生产级 Agent 架构图

```
┌────────────────────────────────────────────────────────────────────┐
│                     用户请求 (HTTP/WebSocket)                        │
└────────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  Stage 1: 入口层(FastAPI)                                             │
│   ├─ 1.1 鉴权 (JWT / OAuth)                                          │
│   ├─ 1.2 用户级限流 (rate limit + 配额)                               │
│   ├─ 1.3 输入过滤 (prompt 注入检测、敏感词)                            │
│   └─ 1.4 创建 trace_id + 注入 metadata                               │
└────────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  Stage 2: 路由层                                                     │
│   ├─ 2.1 意图分类 (chat? rag? agent?)                                │
│   ├─ 2.2 Agent 选择 (单 Agent / Multi-Agent / 哪个 Supervisor)        │
│   └─ 2.3 上下文加载 (从 PG checkpoint 恢复历史)                        │
└────────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  Stage 3: Agent 执行 (LangGraph)                                    │
│                                                                    │
│   ┌──────────────────────────────────────────────────────┐         │
│   │   Agent Node (LLM 思考)                               │         │
│   │   ├─ Tool 列表 = 业务 Tools + RAG Tools + MCP Tools   │         │
│   │   ├─ 按用户权限过滤 Tools                              │         │
│   │   └─ Token 预算检查                                   │         │
│   └──────────────────┬───────────────────────────────────┘         │
│                      ▼                                              │
│   ┌──────────────────────────────────────────────────────┐         │
│   │   条件边:有 tool_calls?                                │         │
│   │   ├─ 高风险工具 → interrupt_before(等人工审批)         │         │
│   │   ├─ 普通工具   → 进入 Tool Node                      │         │
│   │   └─ 无 → 结束                                        │         │
│   └──────────────────┬───────────────────────────────────┘         │
│                      ▼                                              │
│   ┌──────────────────────────────────────────────────────┐         │
│   │   Tool Node (执行工具)                                │         │
│   │   ├─ 参数校验 (Pydantic + 业务规则)                    │         │
│   │   ├─ 权限二次确认                                      │         │
│   │   ├─ 调用 (本地 / MCP / HTTP API)                      │         │
│   │   ├─ 失败重试 (tenacity, 指数退避)                     │         │
│   │   ├─ 超时保护                                          │         │
│   │   └─ 写审计日志                                        │         │
│   └──────────────────┬───────────────────────────────────┘         │
│                      └──── 回到 Agent Node (循环)                    │
└────────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  Stage 4: 输出层                                                     │
│   ├─ 4.1 答案后处理 (敏感词过滤、引用补全)                              │
│   ├─ 4.2 流式推送 (SSE / WebSocket)                                  │
│   ├─ 4.3 写入 trace (Langfuse)                                      │
│   ├─ 4.4 持久化 checkpoint (PostgresSaver)                          │
│   └─ 4.5 提供反馈入口 (返回 trace_id)                                 │
└────────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌────────────────────────────────────────────────────────────────────┐
│            返回最终答案 + trace_id + 流式中间步骤                      │
└────────────────────────────────────────────────────────────────────┘

横向支撑组件:
  • Tool 层    : 业务 Tools / RAG Tools / MCP Adapter / Tool 注册中心
  • 数据层     : PostgreSQL (业务数据 + checkpoint + 审计日志) + PGVector (向量) + Redis (缓存/限流)
  • 观测层     : Langfuse (trace) + Prometheus (metrics) + Grafana (dashboard) + ELK (日志)
  • 安全层     : 鉴权 / 权限模型 / 输入过滤 / 输出审核 / 沙箱
```

#### 3.6.3 高风险动作的安全机制（重要,不能漏）

学工系统场景下,Agent 可能调用：发通知、改成绩、删档案、批审批……一旦失控后果严重。以下三层防护**全都要做**:

**第一层：Tool 设计层**

```python
@tool("update_score", args_schema=UpdateScoreArgs)
def update_score(student_no: str, course: str, new_score: float, _user_role: str) -> str:
    if _user_role not in {"teacher", "admin"}:
        return "权限不足:只有教师/管理员可改成绩"
    if not (0 <= new_score <= 100):
        return "成绩必须在 0-100 之间"
    if abs(new_score - get_old_score(student_no, course)) > 30:
        return "变化幅度过大,请联系管理员审批"
    return do_update(...)
```

**第二层：Agent 编排层（HITL）**

```python
HIGH_RISK_TOOLS = {"update_score", "send_notice", "delete_archive"}

agent = create_react_agent(
    model=llm,
    tools=tools,
    checkpointer=PostgresSaver(...),
    interrupt_before=["tools"],
)

snapshot = agent.get_state(config)
last_msg = snapshot.values["messages"][-1]
risky_calls = [c for c in last_msg.tool_calls if c["name"] in HIGH_RISK_TOOLS]

if risky_calls:
    push_to_approval_queue(trace_id, risky_calls)
else:
    agent.stream(None, config=config)
```

**第三层：审计与回滚**

- 每个高风险工具调用前后**都写审计日志**(谁/何时/原值/新值/Agent trace_id)
- 提供**一键回滚**(基于审计日志反向操作)
- **告警**(高频调用或大额操作触发邮件/钉钉)

#### 3.6.4 你项目里 Agent 该怎么落地（学工系统为例）

按以下顺序补齐能力（**先跑通,再做完美**）：

| 周次 | 目标 | 必备能力（# 对应 3.6.1 表格） |
|:--|:--|:--|
| W1 | 单 Agent + Mock Tools 跑通 | 1, 9 |
| W2 | 接 Java MCP Server | 1, 5 |
| W3 | 加 Checkpoint + 多轮记忆 | 6, 7 |
| W4 | 加 Langfuse + 审计日志 | 18, 19 |
| W5 | 加 HITL + 权限 + 失败重试 | 3, 10, 11, 12, 13 |
| W6 | 加输入过滤 + 输出审核 | 16, 17 |
| W7 | 加并发/Token 控制 + 反馈闭环 | 14, 15, 25 |
| W8+ | Multi-Agent 拆分 + 评估 + 灰度 | 22, 23 + Multi-Agent |

---

### 3.7 推荐借鉴的优秀 Agent 开源项目

> RAG 方面我们已经有 Langchain-Chatchat / RAGFlow / FastGPT 等参考。Agent 方面下列项目按推荐优先级排列。

#### 3.7.1 框架/基础设施类（学习"怎么做") ⭐⭐⭐

| 项目 | 链接 | 看什么 | 借鉴价值 |
|:--|:--|:--|:--|
| **LangGraph 官方模板** | <https://github.com/langchain-ai/react-agent> | 标准 LangGraph 项目结构(`src/agent/graph.py` / `langgraph.json`) | ⭐⭐⭐⭐⭐ 必看,你自己的目录就照这个搭 |
| **LangChain Academy** | <https://github.com/langchain-ai/langchain-academy> | Module 1-6 的 Notebook,系统化讲 State/Memory/Subgraph/Multi-Agent | ⭐⭐⭐⭐⭐ 系统化学习 |
| **LangGraph 官方示例** | <https://github.com/langchain-ai/langgraph/tree/main/examples> | 各种典型 Agent 的写法(client_support / customer_support / sql_agent) | ⭐⭐⭐⭐ |
| **GPT Researcher** | <https://github.com/assafelovic/gpt-researcher> | 研究型 Agent 的工程实现,多步骤报告生成 | ⭐⭐⭐⭐ |
| **OpenHands**（前 OpenDevin） | <https://github.com/All-Hands-AI/OpenHands> | 工程化最完整的开源 Agent,代码执行 / 沙箱 / Multi-Agent / 审计齐全 | ⭐⭐⭐⭐⭐ 学工程化的天花板 |

#### 3.7.2 业务平台类（学习"产品形态"） ⭐⭐⭐

| 项目 | 链接 | 看什么 | 借鉴价值 |
|:--|:--|:--|:--|
| **Dify** | <https://github.com/langgenius/dify> | Workflow 编排 / Tool 管理 / 多模型 / 应用发布 / 完整前后端 | ⭐⭐⭐⭐⭐ AI 应用平台天花板 |
| **FastGPT** | <https://github.com/labring/FastGPT> | 工作流节点设计 / 知识库 + Agent 整合 | ⭐⭐⭐⭐ |
| **n8n + AI 节点** | <https://github.com/n8n-io/n8n> | 工作流自动化平台,大量 AI 节点参考 | ⭐⭐⭐ 看 workflow 设计 |
| **Bisheng** | <https://github.com/dataelement/bisheng> | 国产开源 LLM 应用 DevOps 平台,工程化思路完整 | ⭐⭐⭐⭐ 国内场景适配好 |

#### 3.7.3 Multi-Agent 框架（学习协作模式） ⭐⭐

| 项目 | 链接 | 看什么 | 借鉴价值 |
|:--|:--|:--|:--|
| **AutoGen** | <https://github.com/microsoft/autogen> | 微软出品,多 Agent 对话协作 | ⭐⭐⭐ 概念学习,生产化建议用 LangGraph |
| **CrewAI** | <https://github.com/crewAIInc/crewAI> | 角色化 Agent 协作(研究员+分析师+写作者) | ⭐⭐⭐ 适合写"Agent 团队" |
| **MetaGPT** | <https://github.com/geekan/MetaGPT> | 模拟软件公司多角色协作(产品/架构/工程师) | ⭐⭐⭐ 多角色 prompt 设计参考 |
| **Swarm**（OpenAI） | <https://github.com/openai/swarm> | 极简 Multi-Agent,适合理解核心思想 | ⭐⭐ 概念学习 |

#### 3.7.4 学习路径建议

```
W1-W2  : 看 LangGraph 官方模板 (react-agent / memory-agent) + LangChain Academy
         → 照着搭你项目的目录结构
         
W3-W4  : 跑通 Dify 本地 Demo,观察其 Workflow 设计
         → 理解"用户视角"的 AI 应用长什么样
         
W5+    : 选一个和你场景接近的项目深读
         - 学工系统业务流程偏向流程审批 → 看 Dify Workflow
         - 涉及代码执行/复杂工具 → 看 OpenHands
         - 涉及知识库 + Agent 混合 → 看 FastGPT
```



### 3.8 学工系统 AI Agent 完整基础架构（项目实战指南）

> 这是你下一步要落地的内容。结合 3.6 的能力清单 + 你的 Java 后端架构,给出**完整可执行的项目骨架**。

#### 3.8.1 整体架构图

```
┌────────────────────────────────────────────────────────────────────┐
│                      前端 (Web / 小程序 / IDEA 插件)                  │
│   学生入口 / 教师入口 / 管理员后台                                       │
└─────────────────────────────────┬──────────────────────────────────┘
                                  │ HTTPS (REST + SSE/WebSocket)
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                     Java 后端 (qicheng-backend)                      │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│   │  业务 API        │  │  MCP Server      │  │  审批中心         │ │
│   │  /api/student/*  │  │  暴露业务 Tools   │  │  /api/approval/* │ │
│   │  /api/score/*    │  │  (HITL 队列消费)  │  │                  │ │
│   │  /api/notice/*   │  │  127.0.0.1:8080  │  │                  │ │
│   └──────────────────┘  └────────┬─────────┘  └──────────────────┘ │
└────────────────────────────────────┼──────────────────────────────┘
                                     │ MCP (streamable-http)
                                     ▼
┌────────────────────────────────────────────────────────────────────┐
│                    Python AI Sidecar (qicheng-ai)                    │
│                   FastAPI on :8001                                   │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐  │
│   │  app/api/                  # FastAPI 路由层                   │  │
│   │   ├─ chat.py               # POST /api/v1/chat/stream         │  │
│   │   ├─ kb.py                 # POST /api/v1/kb/{ingest,query}   │  │
│   │   ├─ agent.py              # POST /api/v1/agent/run (流式)    │  │
│   │   ├─ approval.py           # POST /api/v1/agent/approve       │  │
│   │   └─ feedback.py           # POST /api/v1/feedback            │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/agents/               # Agent 编排层                      │  │
│   │   ├─ base.py               # Agent 基类 + 通用配置             │  │
│   │   ├─ student_agent.py      # 学生事务 Agent                    │  │
│   │   ├─ teacher_agent.py      # 教师事务 Agent                    │  │
│   │   ├─ admin_agent.py        # 管理员 Agent (含高风险工具)       │  │
│   │   └─ supervisor.py         # Multi-Agent 主管(可选,后期加)     │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/graph/                # 自定义 LangGraph (复杂流程)        │  │
│   │   ├─ approval_flow.py      # HITL 审批流程图                   │  │
│   │   └─ rag_agent_flow.py     # RAG + Agent 混合流程图            │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/tools/                # 工具层                            │  │
│   │   ├─ mcp_client.py         # MultiServerMCPClient (单例)       │  │
│   │   ├─ rag_tools.py          # 把 RAG 检索包装成 Tool            │  │
│   │   ├─ local_tools.py        # 不需要后端的本地工具(计算等)        │  │
│   │   └─ tool_registry.py      # 按用户角色返回可用工具列表          │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/rag/                  # RAG 模块                          │  │
│   │   ├─ loader.py             # 文档加载                          │  │
│   │   ├─ splitter.py           # 切分                              │  │
│   │   ├─ store.py              # PGVector store 单例               │  │
│   │   ├─ retriever.py          # 混合检索 + Reranker               │  │
│   │   ├─ query_transform.py    # HyDE / Multi-Query                │  │
│   │   ├─ filters.py            # Metadata Filter                   │  │
│   │   └─ eval.py               # 评估                              │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/llm/                  # LLM 客户端                        │  │
│   │   ├─ openai_client.py      # 通过 One-API 接入                 │  │
│   │   └─ fallback.py           # 降级备用模型                      │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/memory/               # 记忆层                            │  │
│   │   ├─ checkpoint.py         # PostgresSaver 配置                │  │
│   │   └─ long_term.py          # 用户长期偏好(可选)                 │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/observability/        # 可观测                            │  │
│   │   ├─ langfuse.py           # CallbackHandler 工厂              │  │
│   │   ├─ logger.py             # structlog 配置                    │  │
│   │   └─ audit.py              # 审计日志写入                      │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/security/             # 安全层                            │  │
│   │   ├─ auth.py               # JWT 验证                          │  │
│   │   ├─ rate_limit.py         # 用户级限流(Redis)                  │  │
│   │   ├─ input_filter.py       # Prompt 注入检测                   │  │
│   │   └─ output_filter.py      # 敏感词 / 内容审核                  │  │
│   ├──────────────────────────────────────────────────────────────┤  │
│   │  app/core/                 # 基础设施                          │  │
│   │   ├─ config.py             # Pydantic Settings                 │  │
│   │   ├─ db.py                 # SQLAlchemy / asyncpg              │  │
│   │   ├─ redis.py              # Redis 连接池                      │  │
│   │   └─ exceptions.py         # 全局异常                          │  │
│   └──────────────────────────────────────────────────────────────┘  │
└────────────────────────┬───────────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┬────────────────────┐
        ▼                ▼                ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ PostgreSQL   │  │   Redis      │  │  Langfuse    │  │  One-API     │
│  + pgvector  │  │ (cache/quota │  │  (trace)     │  │ (LLM 网关)   │
│ • 业务数据    │  │  /rate limit)│  │              │  │ • DeepSeek   │
│ • checkpoint │  │              │  │              │  │ • Qwen       │
│ • 审计日志    │  │              │  │              │  │ • 备用模型    │
│ • 向量库      │  │              │  │              │  │              │
│ • feedback   │  │              │  │              │  │              │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

#### 3.8.2 各模块职责清单（写代码前的契约）

| 模块 | 单一职责 | 不应该做什么 |
|:--|:--|:--|
| `app/api/` | HTTP 层,只做参数校验 + 调用下层 | ❌ 不写业务逻辑 |
| `app/agents/` | LangGraph 配置 + Agent 创建 | ❌ 不写工具实现 |
| `app/graph/` | 复杂自定义 StateGraph | ❌ 简单流程别用 |
| `app/tools/` | 工具实现 + MCP 接入 | ❌ 不依赖 FastAPI request |
| `app/rag/` | RAG 全流程 | ❌ 不直接被 API 调用,通过 tool 暴露 |
| `app/llm/` | LLM 客户端封装 | ❌ 不在其他地方直接 import openai |
| `app/memory/` | Checkpoint + 长期记忆 | ❌ 不写业务记忆 |
| `app/observability/` | 日志 / trace / 审计 | ❌ 不影响业务流程 |
| `app/security/` | 认证 / 限流 / 过滤 | ❌ 业务规则不在这里 |
| `app/core/` | 配置 / DB / Redis | ❌ 不写业务 |

#### 3.8.3 数据库表设计（最小集合）

```sql
-- 1. LangGraph Checkpoint 自动管理(用 PostgresSaver 自动建)
-- 不需要你手动建,但要知道它存了什么

-- 2. 审计日志 (你自己建)
CREATE TABLE ai_audit_log (
    id BIGSERIAL PRIMARY KEY,
    trace_id TEXT NOT NULL,         -- 关联 Langfuse trace
    user_id TEXT NOT NULL,
    user_role TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_args JSONB NOT NULL,
    tool_result TEXT,
    is_high_risk BOOLEAN DEFAULT FALSE,
    approved_by TEXT,                -- HITL 审批人
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_audit_user ON ai_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_trace ON ai_audit_log(trace_id);

-- 3. HITL 待审批队列
CREATE TABLE ai_approval_queue (
    id BIGSERIAL PRIMARY KEY,
    trace_id TEXT UNIQUE NOT NULL,
    thread_id TEXT NOT NULL,         -- LangGraph thread_id
    user_id TEXT NOT NULL,
    pending_tool_calls JSONB NOT NULL,
    status TEXT DEFAULT 'pending',   -- pending/approved/rejected/expired
    handler TEXT,
    handled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- 4. 用户反馈
CREATE TABLE ai_feedback (
    id BIGSERIAL PRIMARY KEY,
    trace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    rating SMALLINT,                 -- 1=赞 / -1=踩
    comment TEXT,
    correction TEXT,                 -- 用户给出的正确答案
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 用户配额
CREATE TABLE ai_user_quota (
    user_id TEXT PRIMARY KEY,
    daily_token_limit INT DEFAULT 100000,
    daily_token_used INT DEFAULT 0,
    monthly_call_limit INT DEFAULT 1000,
    reset_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 知识库 collection 元数据(配合 PGVector)
CREATE TABLE ai_kb_collection (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,       -- e.g. "学籍规定_v3"
    department TEXT,                  -- 用于权限过滤
    version TEXT,
    doc_count INT DEFAULT 0,
    chunk_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3.8.4 关键 API 设计

```python
# POST /api/v1/agent/run
{
  "user_id": "u_001",
  "session_id": "s_abc",
  "messages": [{"role": "user", "content": "..."}],
  "agent_type": "student",  # student / teacher / admin
  "stream": true
}

# 流式响应 (SSE)
# event: thinking → LLM 思考中
# event: tool_call → 调用工具
# event: tool_result → 工具结果
# event: approval_required → 需要审批 (附 trace_id)
# event: token → 流式 token
# event: done → 完成 (附 trace_id)

# POST /api/v1/agent/approve
{
  "trace_id": "...",
  "decision": "approve" | "reject" | "modify",
  "modified_args": {...}  # 可选,审批人可修改参数
}

# POST /api/v1/feedback
{
  "trace_id": "...",
  "rating": 1,
  "comment": "...",
  "correction": "..."
}
```

#### 3.8.5 落地实施路线图

| 阶段 | 周次 | 目标 | 关键产出 |
|:--|:--|:--|:--|
| **MVP** | W1 | 单 Agent + Mock Tool 跑通 | `app/agents/student_agent.py` + `/api/v1/agent/run` |
| **MVP** | W2 | 接 Java MCP + 真实业务 Tool | `app/tools/mcp_client.py` + 至少 3 个真实工具 |
| **MVP** | W3 | 加 RAG (学籍规定知识库) | 完整 RAG pipeline + 通过工具暴露 |
| **MVP** | W4 | 加 Checkpoint + 多轮记忆 | PostgresSaver + thread_id 串多轮 |
| **生产化** | W5 | 加 Langfuse + 审计日志 | trace 完整可见 + audit 表写入 |
| **生产化** | W6 | 加 HITL + 高风险工具审批 | 审批队列 + `/api/v1/agent/approve` |
| **生产化** | W7 | 加权限 + 限流 + Token 控制 | 不同角色不同 Tool 列表 + 配额表 |
| **生产化** | W8 | 加输入/输出过滤 | Prompt 注入检测 + 敏感词过滤 |
| **优化** | W9 | 加流式 + 错误重试 | SSE 完整 + tenacity 重试 |
| **优化** | W10 | 加反馈 + 评估 | feedback 表 + golden set 评估 |
| **进阶** | W11+ | Multi-Agent / Plan-and-Execute | 按业务复杂度选择性引入 |

#### 3.8.6 不要踩的坑

| 坑 | 表现 | 怎么避免 |
|:--|:--|:--|
| **过早 Multi-Agent** | 工具才 5 个就拆 Supervisor → 复杂度爆炸 | 工具数 > 10 再考虑 |
| **直接给 LLM SQL 工具** | LLM 写出 `DROP TABLE` | 永远不要,改用业务 Tool 或只读视图 |
| **没有 HITL 就上生产** | 一次 LLM 抽风发了 1000 封通知 | 高风险工具一律 HITL |
| **不写审计日志** | 出问题查不到谁让 Agent 干的 | Day 1 就接 Langfuse |
| **State 无限增长** | messages 越来越长,token 爆炸 | 周期性 `trim_messages` |
| **同步阻塞调用** | FastAPI worker 全卡死 | 全用 `ainvoke` + async tool |
| **MCP 连接泄漏** | 重启才恢复 | 用 FastAPI lifespan 管理 |
| **不锁版本** | 升级 langgraph 直接挂 | `langchain>=1.0,<2.0`、`langgraph>=1.0,<2.0` |
| **prompt 写死在代码里** | 改 prompt 要改代码、重新部署 | 抽到配置文件 / 数据库,支持热加载 |
| **直接信任 RAG context** | RAG 结果被注入恶意指令 | 用专门的 system message 隔离 + 输出审核 |

#### 3.8.7 Day 1 你应该做的事（脱离学习,正式开干）

```bash
# 1. 创建项目骨架
mkdir -p qicheng-ai/app/{api,agents,graph,tools,rag,llm,memory,observability,security,core}
cd qicheng-ai

# 2. 初始化依赖
uv init
uv add fastapi uvicorn pydantic-settings python-dotenv \
       "langchain>=1.0" "langgraph>=1.0" "langchain-openai" \
       "langgraph-checkpoint-postgres" "langchain-mcp-adapters" \
       "langchain-postgres" "langchain-huggingface" pgvector \
       "redis>=5.0" structlog langfuse tenacity httpx

# 3. 在 app/core/config.py 写配置
# 4. 在 app/llm/openai_client.py 写 LLM 客户端
# 5. 在 app/agents/student_agent.py 写第一个 Agent (用 Mock tools)
# 6. 在 app/api/agent.py 暴露 /api/v1/agent/run (先非流式)
# 7. 启动 uvicorn,用 curl 验证

# 完成上面 → 你已经有可运行的最小骨架
# 后续按 3.8.5 路线图逐周扩展
```



### 3.1 LangGraph 概念地图（用 Java 类比）

LangGraph 是 LangChain 团队做的**有向图状态机**，专门用来编排多步骤 Agent。Java 视角：

- `StateGraph` = 一张状态机（类似 Spring StateMachine）
- `Node` = 一个 step，本质就是一个函数 `(State) -> StateUpdate`
- `Edge` = 流转规则，可以是固定的（`add_edge`）或条件的（`add_conditional_edges`）
- `State` = 整个流程共享的"上下文对象"（typed dict / Pydantic）
- `Checkpoint` = 持久化（PostgreSQL/Redis）。**有了 checkpoint，一次对话就可以跨进程恢复**，相当于 Spring Session 但是粒度到每一步。
- `Tool` = 一个被 LLM 调用的"函数"，相当于 Function Calling 的 Java 端实现。

LangGraph v1（2026 GA）的关键变化：

- 旧的 `create_react_agent` 已废弃，改用 LangChain v1 的 `create_agent`。
- 核心 Graph API（`StateGraph`、`add_node`、`add_edge`）保持稳定。

### 3.2 LangGraph 官方 Quickstart ⭐ 必做

- 文档（v1）：<https://docs.langchain.com/oss/python/langgraph/quickstart>
- GitHub：<https://github.com/langchain-ai/langgraph>（30K stars，主仓 + 文档活跃）

最简单的"计算器 Agent"（Quickstart 里有完整代码），跑一遍：

```bash
cd ai
uv add "langgraph>=1.0" "langchain>=1.0" "langchain-openai"
uv run python scripts/learn_04_calculator_agent.py
```

完成检验：你能回答出"`add_node`、`add_edge`、`add_conditional_edges`、`compile()`"分别在干什么。

### 3.3 LangChain Academy（免费课）⭐ 推荐

- 课程仓库：<https://github.com/langchain-ai/langchain-academy>
- 内容：从 Hello World、State、Memory、Subgraph，一直到 Multi-Agent。
- 形式：Jupyter Notebook，用 VS Code 或 IDEA 的 Jupyter 插件打开。

```bash
git clone https://github.com/langchain-ai/langchain-academy ~/labs/lg-academy
cd ~/labs/lg-academy
uv venv && source .venv/bin/activate
uv pip install -r requirements.txt
jupyter lab
```

每天做一个 module，5-7 天结业。**这是性价比最高的系统化学习资源**。

### 3.4 Tool Calling + MCP 客户端 ⭐ 必做

> **直接对应你架构里的"AI ↔ Java"通信**：Java MCP Server 暴露 `student.find` / `notice.send` 等工具，Python AI 端是 MCP Client。

#### 3.4.1 MCP 起步：先用官方 SDK 跑一个本地 demo

- GitHub：<https://github.com/modelcontextprotocol/python-sdk>（22K stars，2026.4 v1.27.0）
- 文档：<https://modelcontextprotocol.github.io/python-sdk/>

```bash
# 单独建一个 lab 目录验证
mkdir -p ~/labs/mcp-hello && cd ~/labs/mcp-hello
uv init
uv add mcp

# 写一个简单的 server：暴露一个 add 工具
cat > server.py <<'PY'
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("HelloMCP", json_response=True)

@mcp.tool()
def add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
PY

uv run python server.py  # 默认监听 :8000/mcp
```

另起一个终端，用 MCP Inspector 调试：

```bash
npx -y @modelcontextprotocol/inspector
# 打开 http://localhost:6274 ，连上 http://localhost:8000/mcp
```

你会看到 `tools/list` 里返回 `add`，点击调用看到 `5 + 3 = 8`。

#### 3.4.2 把 LangGraph Agent 接到 MCP

参考：<https://github.com/langchain-ai/langchain-mcp-adapters>

```bash
cd ai
uv add langchain-mcp-adapters
```

写一个 `scripts/learn_05_mcp_agent.py`：

```python
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent
from langchain.chat_models import init_chat_model

async def main():
    async with MultiServerMCPClient(
        {
            "hello": {"url": "http://localhost:8000/mcp", "transport": "streamable_http"},
        }
    ) as client:
        tools = client.get_tools()
        model = init_chat_model("deepseek-chat", base_url=..., api_key=...)
        agent = create_agent(model, tools)
        result = await agent.ainvoke({"messages": [{"role": "user", "content": "帮我算 12 + 30"}]})
        print(result["messages"][-1].content)

import asyncio; asyncio.run(main())
```

跑通后，你就理解了**"LLM 看到工具列表 → 自己选择调哪个 → 拿结果继续推理"**这一闭环。

#### 3.4.3 接 Java MCP Server（项目里真正要做的事）

我们 `backend/` 已经预留了 MCP Server 接口。等 Java 端起来后，把上面 `client.get_tools()` 里的 URL 换成 `http://127.0.0.1:8080/mcp` 就完事。

**带回 `qicheng-ai`**：

- `app/tools/mcp_client.py`：封装 MultiServerMCPClient（生命周期由 FastAPI lifespan 管理）。
- `app/agents/student_agent.py`：用 `create_agent` 写一个学生事务 Agent，工具来自 MCP。
- `app/graph/`：当流程复杂（要分支、要 HITL）时再写自定义 StateGraph。

### 3.5 LangGraph 官方模板仓库（参考工程结构）

- React Agent 模板：<https://github.com/langchain-ai/react-agent>
- Memory Agent 模板：<https://github.com/langchain-ai/memory-agent>
- Data Enrichment Agent：<https://github.com/langchain-ai/data-enrichment>

**怎么用**：克隆下来扫一遍 `pyproject.toml`、`langgraph.json`、`src/agent/graph.py`。**这就是 LangGraph 项目的标准目录长相**，照着把我们 `app/graph/` 的骨架立起来。

```bash
git clone https://github.com/langchain-ai/react-agent ~/labs/react-agent
cd ~/labs/react-agent
uv pip install -e ".[dev]"
# 安装 LangGraph CLI
uv pip install "langgraph-cli[inmem]"
langgraph dev
# 浏览器自动打开 LangGraph Studio，可视化看图、调试
```

**强烈推荐**装 LangGraph Studio：在 IDE 旁边再开一个浏览器 tab，**所见即所得地看 Agent 状态流转**，比读日志高效 10 倍。





## Phase 4：可观测 + 工程化（1-2 天）

### 4.1 Langfuse 自托管（一定要装！）

> AI 项目的"调试器"。你写的每一段 prompt、LLM 返回了多少 token、工具调用花了多久、第几步重试了——全在这里看得到。**不接 Langfuse 就别上生产**。

- GitHub：<https://github.com/langfuse/langfuse>（活跃，v3 已 GA）
- 自托管文档：<https://langfuse.com/self-hosting/local>

```bash
git clone https://github.com/langfuse/langfuse ~/labs/langfuse
cd ~/labs/langfuse
docker compose up -d
# 访问 http://localhost:3000 ，注册账号 → 创建 project → 拿到 PUBLIC_KEY / SECRET_KEY
```

把它接到 LangChain/LangGraph：

```python
# 1. uv add langfuse
# 2. ai/.env 增加：
#    LANGFUSE_HOST=http://127.0.0.1:3000
#    LANGFUSE_PUBLIC_KEY=pk-lf-xxx
#    LANGFUSE_SECRET_KEY=sk-lf-xxx
from langfuse.langchain import CallbackHandler
handler = CallbackHandler()

result = agent.invoke(
    {"messages": [{"role":"user","content":"..."}]},
    config={"callbacks":[handler], "metadata": {"user_id":"u_001"}},
)
```

成功的话，刷新 Langfuse → Traces，能看到一棵完整的调用树。

**带回 `qicheng-ai`**：在 `app/observability/langfuse.py` 里实现一个 `get_callbacks(user_id, session_id)`，并在 chat / agent 入口处 `config["callbacks"] = get_callbacks(...)`。

### 4.2 工程化收尾

读这两份文档当复习：

- LangGraph Streaming：<https://docs.langchain.com/oss/python/langgraph/streaming>
- LangGraph Persistence + Postgres Checkpoint：<https://docs.langchain.com/oss/python/langgraph/persistence>

我们已经有 PG 了，可以直接用 `langgraph-checkpoint-postgres`，多轮对话恢复对你 SaaS 场景很关键。







## Phase 5：搬到 `qicheng-ai`（2-3 天）

到这里你已经"摸过"了所有关键拼图。下面是**收口的产出清单**，做到的话就算入门。

### 5.1 端到端 Demo 1：流式对话

- [ ] `app/llm/openai_client.py`：基于 One-API 的 OpenAI client 单例。
- [ ] `app/api/chat.py`：`POST /api/v1/chat/stream`，SSE 流式返回。
- [ ] 在 IDEA 里跑：浏览器访问 `http://localhost:8001/docs`，触发请求看到流式输出。
- [ ] Langfuse 里能看到 trace。

### 5.2 端到端 Demo 2：RAG 知识库问答

- [ ] `app/rag/store.py`：PGVector store + 一份样例资料 `data/raw/`。
- [ ] `app/api/kb.py`：`POST /api/v1/kb/ingest` 上传文档、`POST /api/v1/kb/query` 检索 + 生成。
- [ ] 在 IDEA 里跑：先 ingest 一份学籍规定，再问"休学最长几年"，回答里能看到 source。

### 5.3 端到端 Demo 3：Tool 调用 Agent

- [ ] 在 `backend/` 里随便先暴露一个 MCP tool（比如 `student.find`，先返回 mock 数据）。
- [ ] `app/tools/mcp_client.py`：MultiServerMCPClient，按 lifespan 管理。
- [ ] `app/agents/student_agent.py`：`create_agent(model, tools)`。
- [ ] `app/api/agent.py`：`POST /api/v1/agent/run`。
- [ ] 测试："帮我查学号 2024001 的学生"，能看到 LLM 自动选择并调用 `student.find`。

### 5.4 提交一份个人小结

不强制，但强烈建议你写在 `ai/NOTES.md`（git 忽略它）：

- 我对 LangGraph State / Node / Edge 的理解（用一段自己的话讲）
- RAG 各个超参（chunk_size、top_k）调整对回答的影响
- Tool calling 失败时的兜底策略
- 我们项目里哪些功能最适合用 RAG，哪些适合纯 LLM，哪些必须用 Agent





## 6. 常见坑（提前预警）

| 坑 | 表现 | 解决 |
| --- | --- | --- |
| 国内拉 PyPI 慢 | `uv sync` 卡住 | `uv pip install -i https://pypi.tuna.tsinghua.edu.cn/simple/ ...` 或在 `~/.config/uv/uv.toml` 配 mirror |
| OpenAI SDK 4xx | One-API 报 `model not found` | One-API 渠道里"模型映射"要把 `deepseek-chat` 配到上游对应 model |
| Embedding 维度不匹配 | PGVector 插入报维度错误 | 一旦切换 embedding 模型，必须 drop 旧表（向量维度在建表时就固定了） |
| LangChain 版本混用 | `ImportError` 或 `AttributeError` | 锁版本：`langchain>=1.0`、`langgraph>=1.0`、`langchain-core>=1.0`；不要混 0.x 教程 |
| `create_react_agent` 报 deprecation | 教程是 v0.x | 改用 `from langchain.agents import create_agent`（v1） |
| MCP Inspector 连不上 | `streamable-http` vs `sse` 协议不匹配 | server 用什么 transport，client 也用什么；推荐统一 `streamable-http` |
| Mac M 系列跑本地大模型卡 | xinference 加载慢 | 本阶段优先用 One-API 接云端模型（DeepSeek/Qwen 都很便宜），本地模型留到后期再玩 |
| pgvector 插件没装 | `type "vector" does not exist` | `psql -c "CREATE EXTENSION IF NOT EXISTS vector;"` |
| async 里用了 sync 调用 | FastAPI 卡死 | `httpx.AsyncClient` / `await langfuse.flush_async()`；同步代码用 `await asyncio.to_thread(...)` |
| Langfuse v2 vs v3 | 文档/SDK 路径不同 | 自托管走 v3（最新 docker compose），SDK 用 `from langfuse.langchain import CallbackHandler` |





## 7. 中文社区与持续学习

- LangChain 中文文档：<https://www.langchain.com.cn/>
- LangChain 大本营（公众号 + B 站搜"LangChain"）有大量中文实战
- DeepSeek 文档：<https://api-docs.deepseek.com/zh-cn/>
- 通义千问 OpenAI 兼容模式：<https://help.aliyun.com/zh/model-studio/openai-compatible-api>
- Awesome MCP：<https://github.com/punkpeye/awesome-mcp-servers>





## 8. 一图速记的学习地图

```
Day 1-2   Python 基础 + FastAPI 入门
Day 3     One-API 部署 + openai SDK 流式对话      → demo: scripts/learn_01_chat.py
Day 4     LangChain Quickstart + LCEL             → demo: scripts/learn_02_langchain.py
Day 5-7   pgvector + LangChain 最小 RAG           → demo: scripts/learn_03_rag.py
Day 8     扫读 Langchain-Chatchat（不抄代码）
Day 9-10  LangGraph Quickstart + LangChain Academy(前 3 个 Notebook)
Day 11-12 MCP SDK + LangChain MCP Adapters         → demo: scripts/learn_05_mcp_agent.py
Day 13    Langfuse 自托管 + 接 LangGraph
Day 14-15 把所有 demo 整理迁回 qicheng-ai
Day 16+   按 5.1/5.2/5.3 三个端到端 demo 逐个交付
```





## 9. 心理建设

- **Java 经验是最大资产**：FastAPI 的 DI、Pydantic 的校验、LangGraph 的状态机，思维方式跟 Spring 没本质区别。
- **不要被术语吓住**：embedding、retriever、reranker、ReAct、ToT，都是"包装好的工程模式"。读一遍代码就懂。
- **数学不用现学**：cosine 相似度、softmax、KL 散度——你扎实的数学功底已经超过 90% 的 AI 应用开发者。
- **让 LLM 帮你学 LLM**：把这份手册扔给 ChatGPT/Claude/Cursor 当你的私教，遇到不懂的概念直接问。

跑完这一遍，你不会变成 AI 算法专家，但**写、改、维护一个 LangGraph + RAG + MCP 的生产级 AI Sidecar 完全没问题**——而这正是我们项目需要的。

加油，三周后 `python-ai` 模块就是你最熟的模块之一。









## 附录 A：LLM 理解复杂语言的底层数学原理

> 这一节从**数学层面**回答"LLM 怎么把一段复杂、嵌套、多段递进的语言,变成一个可执行的决策(包括 tool_calls)"。
> 这部分不影响应用开发,但能让你在调 prompt、设计 Agent 时**知其所以然**。

### A.1 核心问题：从字符串到结构化决策

输入是一段文字：

```
"今天几号? 另外帮我查一下休学和转专业的规定"
```

输出是结构化决策：

```json
{
  "tool_calls": [
    {"name": "get_current_date", "args": {}},
    {"name": "search_policy", "args": {"keyword": "休学"}},
    {"name": "search_policy", "args": {"keyword": "转专业"}}
  ]
}
```

**关键问题**：LLM 是怎么从无序的字符串中,识别出"今天几号"、"查规定"是两个独立任务,且"查规定"又包含"休学"和"转专业"两个子查询的?

答案藏在 **Transformer 架构** 中。下面逐层解析。



### A.2 Embedding：把词变成向量

#### A.2.1 Tokenization（分词）

输入文字先被拆成 token（不是字符,也不完全是词）：

```
"今天几号? 另外帮我查休学规定"
   ↓ Tokenizer (BPE/SentencePiece)
["今天", "几", "号", "?", " 另外", "帮", "我", "查", "休", "学", "规定"]
   ↓ token_id 映射
[5234, 891, 1023, 65, 3421, 567, 234, 1892, 4521, 234, 7821]
```

每个 token 对应词表中的一个整数 ID。GPT-4 词表约 10 万,DeepSeek 约 12 万。

#### A.2.2 Embedding Lookup

Embedding 矩阵 $E \in \mathbb{R}^{V \times d}$（\(V\) = 词表大小, \(d\) = 向量维度,如 4096）：

$$
\mathbf{x}_i = E[\text{token\_id}_i] \in \mathbb{R}^d
$$


每个 token 变成一个 \(d\) 维向量。**这个向量在训练中学到了"这个 token 在所有上下文中的统计含义"**——比如 "苹果" 的向量同时编码了"水果"和"科技公司"的语义,具体激活哪部分由后续的 attention 决定。

数学上,token 到向量的过程是：
$$
X = [\mathbf{x}_1, \mathbf{x}_2, \dots, \mathbf{x}_n]^T \in \mathbb{R}^{n \times d}
$$
其中 \(n\) 是序列长度。**这就是 LLM 看到的"输入"——一个 $n \times d$ 的矩阵**。



### A.3 Self-Attention：理解词与词的关系

这是 Transformer 的**数学核心**,也是回答你问题的关键。

#### A.3.1 直觉：每个词应该关注哪些词?

考虑句子 "查一下休学和转专业的规定"。当 LLM 处理 "规定" 这个 token 时:
- 它应该**重点关注** "休学"、"转专业"（这是规定的修饰对象）
- 它应该**轻度关注** "查"（动作）
- 它应该**几乎忽略** "一下"、"的"（功能词）

**Self-Attention 的本质就是为每对 token 计算一个"关注度权重"**。

#### A.3.2 Q / K / V 三个向量

对每个输入向量 $\mathbf{x}_i$ ,通过**三个独立的线性变换**得到：
$$
\mathbf{q}_i = W_Q \mathbf{x}_i \quad \text{(Query, 我想找什么)}
$$

$$
\mathbf{k}_i = W_K \mathbf{x}_i \quad \text{(Key, 我能提供什么)}
$$

$$
\mathbf{v}_i = W_V \mathbf{x}_i \quad \text{(Value, 我的实际内容)}
$$



其中 $W_Q, W_K, W_V \in \mathbb{R}^{d \times d_k}$ 是**训练学到的权重矩阵**。

**类比**：想象 token 之间在搞一场"配对":

- 每个 token 拿着一个"我想找什么"的牌子（Query）
- 每个 token 也拿着一个"我能提供什么"的牌子（Key）
- 每个 token 还有"实际内容"（Value）

#### A.3.3 Attention 公式（Scaled Dot-Product Attention）

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{Q K^T}{\sqrt{d_k}}\right) V
$$

**逐步拆解**：

1. **\($Q K^T$\)**：计算每个 Query 和每个 Key 的点积,得到 \($n \times n$\) 的相似度矩阵。
   $$
   (Q K^T)_{ij} = \mathbf{q}_i \cdot \mathbf{k}_j
   $$
   
   含义：第 \(i\) 个 token 对第 \(j\) 个 token 的"原始关注分数"。
   
2. **\($\sqrt{d_k}$\)**：缩放,防止点积过大导致 softmax 梯度消失。

3. **\($\text{softmax}$\)**：对每一行做 softmax,把分数转成**概率分布**（每行加起来 = 1）。
   $$
   \alpha_{ij} = \frac{\exp((Q K^T)_{ij}/\sqrt{d_k})}{\sum_{l} \exp((Q K^T)_{il}/\sqrt{d_k})}
   $$
   \($\alpha_{ij}$\) 就是 token \(i\) "关注" token \(j\) 的权重。

4. **\($\cdot V$\)**：用这些权重对所有 Value 加权求和,得到每个位置的新表示。
   $$
   \mathbf{z}_i = \sum_j \alpha_{ij} \mathbf{v}_j
   $$

**结果**：每个 token 的新向量 \($\mathbf{z}_i$\) 是所有 token 的 Value 的加权平均,权重由"它对其他 token 的关注度"决定。



#### A.3.4 直觉重建

继续 "规定" 这个 token 的例子。经过 Self-Attention 后:

```
"规定" 的新向量 ≈ 0.40 × Value("休学")
              + 0.35 × Value("转专业")
              + 0.10 × Value("查")
              + 0.05 × Value("的")
              + 0.10 × Value(其他)
```

**这就是"规定"在这个上下文里的含义被编码进向量了**——它不再是孤立的"规定",而是"关于休学和转专业的规定"。



### A.4 Multi-Head Attention：从多个角度看关系

单个 Attention 只能学一种关系。**Multi-Head Attention 用多组 \((W_Q, W_K, W_V)\) 并行计算,捕捉不同的语义关系**：
$$
\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \dots, \text{head}_h) W_O
$$

$$
\text{head}_i = \text{Attention}(Q W_Q^i, K W_K^i, V W_V^i)
$$

GPT-4 / DeepSeek 等模型一般有 32-128 个 head。**每个 head 学习不同的"关注模式"**:

- Head 1 可能专门关注**主谓关系**（"我"→"查"）
- Head 2 可能专门关注**修饰关系**（"休学"→"规定"）
- Head 3 可能专门关注**并列关系**（"休学" 和 "转专业"）
- Head 4 可能专门关注**远距离指代**（前面提到的实体）
- ... 

**这就是处理嵌套和复杂语义的关键**——单一关系不够,多个 head 同时工作,综合得到丰富的语义表示。



### A.5 Position Encoding：保留语序信息

Self-Attention 本身**没有顺序概念**——交换 token 顺序结果一样。所以要加位置编码：

#### A.5.1 经典方案：Sinusoidal Position Encoding

$$
PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d}}\right)
$$

$$
PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d}}\right)
$$

把位置信息编码成向量,加到 input embedding 上。



#### A.5.2 现代方案：RoPE（旋转位置编码）

LLaMA / DeepSeek / Qwen 都用 **RoPE**,它把位置信息**编码到 Query 和 Key 的旋转角度中**：
$$
\mathbf{q}_m' = R_m \mathbf{q}_m, \quad \mathbf{k}_n' = R_n \mathbf{k}_n
$$
其中 \(R_m\) 是与位置 \(m\) 有关的旋转矩阵。性质：
$$
\mathbf{q}_m'^T \mathbf{k}_n' = \mathbf{q}_m^T R_{n-m} \mathbf{k}_n
$$
**关键性质**：点积只依赖**相对位置 \(n - m\)**,不依赖绝对位置。这让模型能更好处理长序列、外推到训练中没见过的长度。





### A.6 Transformer Block 的数学全貌

一个 Transformer Block 的完整计算（输入 $X$,输出 $X'$）：

```
1. LayerNorm
   X̃ = LayerNorm(X)

2. Multi-Head Attention + 残差
   A = MultiHead(X̃, X̃, X̃)
   X = X + A             ← 残差连接

3. LayerNorm
   X̃ = LayerNorm(X)

4. Feed-Forward Network + 残差
   F = FFN(X̃) = GeLU(X̃ W_1 + b_1) W_2 + b_2
   X' = X + F            ← 残差连接
```

数学公式：
$$
X' = X + \text{FFN}(\text{LN}(X + \text{Attn}(\text{LN}(X))))
$$
**FFN 的作用**：每个 token 独立地经过两层全连接（中间维度通常是 \(4d\)）,这是"思考加工"的环节。Attention 负责"看周围",FFN 负责"自己想"。



### A.7 多层堆叠：从浅层语法到深层逻辑

GPT-4 / DeepSeek 都堆叠了 **几十到上百层 Transformer Block**。每一层的作用是渐进式的：

| 层级 | 作用 | 类比 |
|:--|:--|:--|
| **第 1-5 层** | 学语法、词性、局部依存 | 小学语文 |
| **第 5-15 层** | 学短语、修饰关系、共指消解 | 中学语文 |
| **第 15-30 层** | 学句子语义、逻辑关系 | 大学阅读理解 |
| **第 30-50 层** | 学段落结构、推理链、意图 | 写作分析 |
| **最后几层** | 学输出格式（function calling、JSON 结构等） | 任务定制 |

**研究证据**：通过"探针实验"（probing）可以发现,语法信息主要分布在中下层,语义和推理信息分布在中上层。这就是为什么深层模型能处理复杂逻辑——**每一层都在前一层基础上做更高级的抽象**。



### A.8 多段问题/嵌套语义/递进逻辑的处理机制

回到你最初的问题：**"今天几号? 另外帮我查休学和转专业的规定"** 是怎么被理解成多段任务的?

#### A.8.1 第一道:Self-Attention 识别"分隔信号"

```
模型在浅层就学到:
- "?" → 高度关注前面的 token,标记一个问题边界
- "另外" / "另" / ", " → 主题切换标记
- "和" → 并列结构标记
- "的" → 修饰关系标记
```

这些是**句法信号**,通过浅层 attention head 自动识别。

#### A.8.2 第二道:Multi-Head 并行抽取多重结构

```
Head A (问题分割) 关注:
   "几号" ← (问题 1)
   "查...规定" ← (问题 2)

Head B (任务对象) 关注:
   "查" → "规定"  (动作-对象)
   "休学" → "规定" (修饰)
   "转专业" → "规定" (修饰)

Head C (并列识别) 关注:
   "休学" ↔ "转专业" (并列项)

Head D (整体规划) 关注:
   句首 → 句尾全文 (全局摘要)
```

**多个 head 并行工作,综合输出 = 完整的语义结构**。

#### A.8.3 第三道:深层 FFN 转化为决策意图

最后几层的 FFN + LM head 把语义结构**翻译成具体的 token 输出**：

```
深层向量 (包含"3 个独立任务"的语义)
   ↓ LM head (vocab_size 维度的 softmax)
预测 token "tool_calls" 的概率最高 → 输出
   ↓ 继续生成
预测 "[" → "{" → "name" → ":" → "get_current_date" → ...
```

这就生成了 JSON 结构的 tool_calls。

#### A.8.4 嵌套语义为什么能搞定

考虑更复杂的嵌套:

> "如果学号 2024001 GPA 大于 3.5,就给他发一封获奖邮件,否则查一下他能否申请奖学金"

LLM 处理它需要:

1. **条件分支识别**: "如果...就...否则..." → 浅层 attention 学到的句法
2. **变量引用**: "学号 2024001" 在多个地方被引用 → attention 跨距离关联
3. **嵌套决策**: 第一个分支只有一个动作,第二个分支需要先查询 → 深层逻辑

这本质上是**多层 attention 的组合**：
- 浅层提取"如果-就-否则"模式
- 中层把"GPA > 3.5"绑定到"学号 2024001"
- 深层规划: 先调 `get_gpa(2024001)`,再根据结果决定调 `send_email` 还是 `check_scholarship`

**这就是 ReAct 链路的底层基础**——LLM 在生成每一步 tool_call 时,都综合考虑了当前 messages 中所有已知信息。



### A.9 Tool Calling 的训练原理

LLM 怎么学会"输出 JSON 格式的 tool_calls"?

#### A.9.1 训练数据构造

```json
{
  "messages": [
    {"role": "user", "content": "查学号 2024001 的 GPA"},
    {"role": "assistant", "content": null,
     "tool_calls": [{"name": "get_gpa", "args": {"student_id": "2024001"}}]},
    {"role": "tool", "content": "3.85"},
    {"role": "assistant", "content": "学号 2024001 的 GPA 是 3.85"}
  ]
}
```

模型通过**监督微调 (SFT)** 学习这种模式:看到 user 消息 + 工具描述 → 输出 tool_calls。

#### A.9.2 数学层面发生了什么

训练目标是**最小化交叉熵损失**:
$$
\mathcal{L} = -\sum_t \log P(y_t | y_{<t}, X)
$$
\($y_t$\) 是 t 时刻应该输出的 token, $X$ 是输入。模型通过梯度下降不断调整所有权重 $(W_Q, W_K, W_V, W_O, W_1, W_2, \dots)$ ,使得在相似上下文下输出正确 token 的概率最大。

经过几万到几百万条工具调用数据训练后,模型的权重中"编码"了:
- 看到工具描述时如何提取参数 schema
- 用户意图和工具名的匹配规律
- JSON 输出格式

#### A.9.3 RLHF / DPO 进一步优化

SFT 之后还有强化学习阶段（RLHF / DPO）:
- 让人类比较两个输出,选哪个更好
- 用偏好数据训练 reward model
- 用 reward model 进一步调整 LLM 的输出

最终效果:**LLM 在生成 tool_calls 时,不仅符合格式,还更"聪明"**(选对工具、传对参数、不滥调)。

---

### A.10 In-Context Learning（上下文学习）

为什么你 prompt 里给几个例子,LLM 就能模仿?这叫 **In-Context Learning**,是 GPT-3 之后 LLM 的核心能力。

**数学上的解释（一种主流假说）**：

Transformer 的 attention 机制本质上等价于在**上下文窗口内做一次"梯度下降"**：

- 上下文中的"例子"被编码进 K/V
- 当前 query 通过 attention 找到最相关的例子
- FFN 完成"模式迁移"

研究表明 (Garg et al., 2022),Transformer 可以**在 forward pass 中模拟简单的学习算法**——这就是为什么你不用真的 fine-tune,只要给 prompt 例子,LLM 就能学到模式。

**对你的实际意义**：这是 prompt engineering 之所以有效的数学基础。Few-shot prompt 不是"提示",而是真的让 LLM 在 forward pass 里"学了一遍"。

---

### A.11 总结：从向量到决策的完整链路

```
输入文字 "今天几号? 帮我查休学和转专业的规定"
   │
   ▼
[1] Tokenization → token_ids
   │
   ▼
[2] Embedding Lookup → X ∈ ℝ^(n×d)
   │
   ▼
[3] + Position Encoding (RoPE)
   │
   ▼
[4] Transformer Block × N 层堆叠
   │   每一层:
   │     - Multi-Head Self-Attention (识别 token 间关系)
   │     - FFN (每个 token 独立加工)
   │     - 残差连接 + LayerNorm
   │
   │   浅层学语法、中层学语义、深层学逻辑/任务
   │
   ▼
[5] 最后一层输出 → LM Head (Linear → softmax over vocab)
   │
   ▼
[6] 自回归生成
   │   - 预测下一个 token
   │   - 加入序列,再过一遍 forward
   │   - 直到 <|EOT|>
   │
   ▼
输出 "好的,我先查日期和规定" 
   tool_calls=[{name:"get_current_date"},
               {name:"search_policy", args:{keyword:"休学"}},
               {name:"search_policy", args:{keyword:"转专业"}}]
```

---

### A.12 你需要带走的几个核心结论

| 问题 | 数学层面的回答 |
|:--|:--|
| LLM 怎么"理解"一句话? | 把 token 变成向量,通过 self-attention 让每个 token 加权汇总其他 token 的信息,得到"上下文化"的表示。 |
| 为什么能识别多段问题? | 浅层 attention head 识别 "?" / "另外" / "和" 等分割信号,中层 head 把不同段落分配到不同语义聚类。 |
| 为什么能处理嵌套语义? | 多层堆叠 → 每一层在前一层基础上做更高级抽象。深层 FFN 处理"在条件 A 下做 B,否则做 C"这种复杂逻辑。 |
| 为什么能输出结构化 tool_calls? | 监督微调 + RLHF,让模型在权重中编码了"用户意图 → JSON 格式工具调用"的映射。 |
| 为什么 prompt 例子有效? | In-Context Learning:Transformer 的 attention 在 forward pass 中等价于一次"小型学习"。 |
| 为什么 Agent 能多步骤推理? | 每一步生成时,LLM 看到完整 messages 历史(包括上一步的 tool 结果),通过 attention 综合所有信息再决定下一步。这就是 ReAct 在数学层面的本质。 |



### A.13 进一步学习资源

| 资源 | 难度 | 推荐 |
|:--|:--|:--|
| **3Blue1Brown - "But what is a neural network?"** | ⭐⭐ | YouTube 系列,数学直觉最强 |
| **Andrej Karpathy - "Let's build GPT"** | ⭐⭐⭐⭐ | 从零手写 GPT,代码 + 数学讲透 |
| **"Attention is All You Need" (原始论文)** | ⭐⭐⭐⭐⭐ | Transformer 原始论文,数学严密 |
| **The Illustrated Transformer (Jay Alammar)** | ⭐⭐⭐ | 图解 Transformer,适合入门 |
| **Stanford CS25: Transformers United** | ⭐⭐⭐⭐ | 斯坦福顶级课,免费视频 |
| **"A Mathematical Framework for Transformer Circuits"** (Anthropic) | ⭐⭐⭐⭐⭐ | 从数学层面解析 Transformer 内部机制 |



> **写在最后**:你不需要现在就完全理解上面的数学细节——做应用开发只需要知道"LLM 通过 attention 综合上下文,通过多层网络做逐渐复杂的抽象"就够了。但当你以后调 prompt 调不出效果、Agent 选错工具时,回头看这一节,你会突然明白:**是不是上下文太长导致关键信号被稀释?是不是 prompt 中的层次结构不够清晰让 attention 抓不到重点?**——这些问题的根源,都在这一章的数学里。
