# SSH MCP Server

[English](README.md) | **中文**

基于 **模型上下文协议 (MCP)** 的 SSH 远程命令执行服务器。让 AI 智能体能够通过标准化的 MCP 接口发现、连接并在远程 SSH 主机上执行命令。

## ✨ 功能特性

- **双层配置系统**：项目级 (`ssh.config`) 和用户级 (`~/.config/mcp-ssh/config`) SSH 配置自动合并
- **连接池复用**：跨命令复用 SSH 连接，自动清理空闲连接
- **命令安全**：内置危险命令黑名单 + 可配置的每主机允许/拒绝列表
- **输出管理**：自动截断输出，防止 LLM 上下文溢出
- **敏感数据保护**：私钥永不出现在工具输出中；密码仅通过环境变量传递
- **标准 SSH 配置语法**：使用 OpenSSH 配置格式 — `Host`、`HostName`、`User`、`Port`、`IdentityFile` 等
- **一键安装向导**：交互式 CLI 引导完成配置

## 🚀 快速开始

### 方式一：一键安装（推荐）

```bash
# 克隆并安装
git clone <repo-url> ssh-mcp-server
cd ssh-mcp-server
npm install && npm run build

# 运行交互式安装向导
npm run setup
```

安装向导会自动：
- 检测你的操作系统和 SSH 环境
- 引导你配置 SSH 主机
- 生成 MCP 客户端配置（Claude Desktop / VS Code Copilot）
- 测试 SSH 连接可用性

### 方式二：手动安装

```bash
npm install
npm run build
```

然后手动创建配置文件（见下方配置章节）。

### 方式三：直接使用 npx（无需安装）

```bash
npx tsx src/index.ts --project-root /你的项目路径
```

## 📦 添加到 MCP 客户端

### 自动生成配置

运行以下命令自动生成 MCP 客户端配置：

```bash
npm run setup:mcp
```

### 手动配置

#### Claude Desktop

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["/path/to/ssh-mcp-server/dist/index.js", "--project-root", "/你的项目路径"],
      "env": {}
    }
  }
}
```

#### VS Code Copilot

在 `.vscode/mcp.json` 中添加：

```json
{
  "servers": {
    "ssh": {
      "command": "node",
      "args": ["/path/to/ssh-mcp-server/dist/index.js", "--project-root", "${workspaceFolder}"]
    }
  }
}
```

#### Augment

在 MCP 设置中添加：

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": ["/path/to/ssh-mcp-server/dist/index.js", "--project-root", "."]
    }
  }
}
```

## ⚙️ 配置

### 配置文件位置

| 层级 | 路径 | 用途 |
|------|------|------|
| 项目级 | `<项目根目录>/ssh.config` | 仅当前项目使用的主机 |
| 用户级 | `~/.config/mcp-ssh/config` | 跨项目共享的主机 |

**合并规则**：项目级配置中同名 Host 的设置会覆盖用户级配置。

### SSH 配置语法

使用标准 OpenSSH 配置语法：

```sshconfig
# 项目级配置 ssh.config
Host prod-db
  HostName db.prod.example.com       # 实际主机名或 IP
  User deploy                        # 登录用户名
  Port 22                            # SSH 端口
  IdentityFile ~/.ssh/deploy_key     # 私钥文件路径
  ConnectTimeout 10                  # 连接超时(秒)
  ServerAliveInterval 60             # 心跳检测间隔(秒)
  # mcp-ssh:denylist = DROP TABLE,rm -rf /,mkfs   # 禁止的命令模式

Host staging
  HostName staging.example.com
  User developer
  IdentityFile ~/.ssh/id_ed25519
  # mcp-ssh:allowlist = ls,cat,grep,find,ps,top,df,du,free,uptime   # 仅允许这些命令
```

### 安全注解

在 Host 块中添加特殊注释来配置安全策略：

```sshconfig
# mcp-ssh:denylist = cmd1,cmd2         # 黑名单：阻止这些命令模式
# mcp-ssh:allowlist = cmd1,cmd2        # 白名单：仅允许这些命令（覆盖黑名单）
# mcp-ssh:maxTimeoutMs = 30000         # 该主机的最大执行超时(毫秒)
# mcp-ssh:maxOutputChars = 5000        # 该主机的最大输出字符数
```

### 认证方式

服务器按以下顺序尝试认证：

1. **密钥认证** — 使用 SSH 配置中 `IdentityFile` 指定的私钥
2. **SSH Agent** — 通过 `SSH_AUTH_SOCK` (Linux/macOS) 或 Pageant (Windows)
3. **密码认证** — 通过环境变量 `SSH_PASSWORD_<主机名>` (大写，特殊字符替换为 `_`)

示例：主机 `my-server` 的密码设置为环境变量 `SSH_PASSWORD_MY_SERVER=你的密码`。

## 🛠 MCP 工具

| 工具 | 描述 | 参数 |
|------|------|------|
| `ssh_list_hosts` | 列出所有可用 SSH 主机 | — |
| `ssh_exec` | 在远程主机上执行命令 | `host`, `command`, `timeout_ms?` |
| `ssh_init_config` | 初始化 SSH 配置文件 | `scope` (project/user), `project_root?`, `hosts?` |
| `ssh_get_config` | 获取特定主机的配置 | `host` |
| `ssh_test_connection` | 测试主机连接 | `host` |
| `ssh_disconnect` | 断开 SSH 会话 | `host?` |

## 📂 MCP 资源

| URI | 描述 |
|-----|------|
| `ssh://hosts` | 所有已配置 SSH 主机的 JSON 列表 |

## 🔐 安全

### 内置保护

- **命令黑名单**：默认阻止危险命令（`rm -rf /`、`mkfs`、`dd if=`、`shutdown`、`reboot`、fork 炸弹、防火墙清空、凭证文件读取）
- **输出消毒**：自动脱敏私钥和敏感环境变量
- **凭证保护**：私钥路径仅显示尾部；密码绝不出现在工具返回值中
- **连接限制**：最大并发连接数（默认 5）+ 空闲超时自动断开
- **输入清理**：自动去除命令中的 null 字节

### 安全建议

1. 优先使用 `IdentityFile`（密钥认证）而非密码
2. 生产服务器建议使用 `# mcp-ssh:allowlist` 白名单模式
3. 若 `ssh.config` 包含敏感主机名，请将其加入 `.gitignore`
4. 生产环境建议启用 `--strict-host-key` 严格主机密钥校验
5. 使用 SSH 证书或 `known_hosts` 固定来验证主机身份

## 📋 CLI 选项

```
ssh-mcp-server [选项]

--project-root <路径>       项目根目录（用于项目级 ssh.config）
--user-config <路径>        自定义用户配置路径（默认: ~/.config/mcp-ssh/config）
--strict-host-key           启用严格主机密钥校验
--no-strict-host-key        禁用严格主机密钥校验（默认）
--timeout <毫秒>            默认命令超时（默认: 60000）
--max-output <字符数>       每个流的最大输出字符数（默认: 10000）
--max-connections <数量>    最大并发 SSH 连接数（默认: 5）
--idle-timeout <毫秒>       连接空闲超时（默认: 600000）
```

## 🏗 架构

```
┌─────────────────────────────────────────────┐
│ MCP 客户端 (Claude/Augment/IDE)             │
│  ↕ JSON-RPC 2.0 over stdio                 │
├─────────────────────────────────────────────┤
│ MCP 服务层                                  │
│  ├─ 工具处理器 (ssh_exec 等)                │
│  ├─ 资源处理器 (ssh://hosts)                │
│  └─ 日志通知                               │
├─────────────────────────────────────────────┤
│ 配置层                                      │
│  ├─ 解析器 (ssh-config 库)                  │
│  ├─ 合并器 (项目级 + 用户级，项目级优先)     │
│  └─ 安全策略 (allowlist / denylist)         │
├─────────────────────────────────────────────┤
│ SSH 层                                      │
│  ├─ 连接池 (ssh2 Client)                    │
│  ├─ 命令执行器 (exec 通道)                  │
│  └─ 输出截断 & 消毒                        │
└─────────────────────────────────────────────┘
```

## 🧑‍💻 开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev -- --project-root .

# 构建
npm run build

# 运行构建后的版本
npm start -- --project-root .

# 使用 MCP Inspector 调试
npm run inspect

# 运行安装向导
npm run setup

# 自动诊断
npm run doctor
```

## 🔍 故障排除

### 常见问题

**Q: 连接超时怎么办？**
运行 `npm run doctor` 诊断环境问题，或检查：
- 目标主机是否可达（`ping <hostname>`）
- SSH 端口是否正确（默认 22）
- 防火墙是否允许出站 SSH 连接

**Q: 认证失败？**
- 确认 `IdentityFile` 指向正确的私钥文件
- 确认私钥文件权限正确（Linux/macOS: `chmod 600`）
- 如使用密码，确认环境变量 `SSH_PASSWORD_<HOST>` 已设置

**Q: MCP 客户端找不到工具？**
- 确认 `node dist/index.js --help` 能正常运行
- 确认 MCP 配置中的路径是绝对路径
- 重启 MCP 客户端

## 📜 许可证

MIT
