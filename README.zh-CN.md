# SSH MCP Server

[![GitHub stars](https://img.shields.io/github/stars/B143KC47/ssh_mcp?style=flat-square)](https://github.com/B143KC47/ssh_mcp/stargazers)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-compatible-6e56cf?style=flat-square)](https://modelcontextprotocol.io/)
[![SSH](https://img.shields.io/badge/SSH-security--first-0f766e?style=flat-square)](https://www.openssh.com/)

[English](README.md) | **中文**

一个面向 MCP 客户端的安全 SSH 服务器。`ssh_mcp` 让 Claude Desktop、VS Code Copilot、Augment 以及其他兼容 MCP 的智能体，可以通过一个带安全护栏的 SSH 代理执行远程命令，同时保留 OpenSSH 配置兼容性、连接池复用和输出截断能力。

## 为什么这个项目更容易被真正用起来

- **延续你已有的 SSH 使用习惯**：支持标准 OpenSSH 字段，如 `Host`、`HostName`、`User`、`Port`、`IdentityFile`、`ProxyJump`
- **比“裸奔式远程执行”更安全**：内置危险命令拦截、每主机白名单/黑名单、输出上限、敏感信息脱敏
- **更适合多轮 AI 操作**：连接池减少重复握手，连续执行更顺滑
- **适配主流 MCP 使用场景**：面向 Claude Desktop、VS Code Copilot、Augment 和其他兼容 MCP 的客户端
- **适合团队协作**：项目级与用户级配置自动合并，共享主机和项目覆盖都能兼顾

## 适用场景

- AI 辅助的线上排障
- 远程主机的观测、巡检、只读操作
- DevOps / 平台工程智能助手
- 需要 SSH 能力，但又不希望把无限制 Shell 权限直接交给智能体的内部工具

## 快速开始

### 1. 安装并构建

```bash
npm install
npm run build
```

### 2. 添加到你的 MCP 客户端

仓库里已经附带可直接复制的示例配置：

- `examples/mcp-config.claude.example.json`
- `examples/mcp-config.vscode.example.json`

Claude Desktop / Augment 最小示例：

```json
{
  "mcpServers": {
    "ssh": {
      "command": "node",
      "args": [
        "/absolute/path/to/ssh-mcp-server/dist/index.js",
        "--project-root",
        "/path/to/your/project"
      ],
      "env": {}
    }
  }
}
```

VS Code MCP 最小示例：

```json
{
  "servers": {
    "ssh": {
      "command": "node",
      "args": [
        "/absolute/path/to/ssh-mcp-server/dist/index.js",
        "--project-root",
        "${workspaceFolder}"
      ]
    }
  }
}
```

### 3. 配置 SSH 主机

把 `examples/ssh.config.example` 复制成项目根目录下的 `ssh.config`，或者直接通过 MCP 工具初始化：

```text
Use tool: ssh_init_config with scope="project"
```

最小示例：

```sshconfig
Host my-server
  HostName 192.168.1.100
  User ubuntu
  Port 22
  IdentityFile ~/.ssh/id_rsa
  # mcp-ssh:denylist = rm -rf,mkfs,dd,shutdown,reboot
```

### 4. 在 MCP 客户端里试试这些指令

- “列出所有可用 SSH 主机。”
- “测试 `my-server` 的 SSH 连接。”
- “在 `my-server` 上执行 `uptime && df -h`。”
- “显示 `my-server` 的合并后 SSH 配置。”

## 核心能力

- **双层配置系统**：项目级 (`ssh.config`) + 用户级 (`~/.config/mcp-ssh/config`) 自动合并
- **连接池复用**：跨命令复用 SSH 连接，自动清理空闲连接
- **每主机安全策略**：支持 allowlist、denylist、超时上限、输出上限
- **输出管理**：自动截断，防止 LLM 上下文被大输出撑爆
- **敏感信息保护**：私钥和敏感环境变量在输出中会被脱敏
- **OpenSSH 兼容**：可以直接延续现有主机别名和 SSH 使用方式

## 配置说明

### 配置文件位置

| 层级 | 路径 | 用途 |
|------|------|------|
| 项目级 | `<项目根目录>/ssh.config` | 当前项目专用主机 |
| 用户级 | `~/.config/mcp-ssh/config` | 跨项目共享主机 |

**合并规则**：项目级配置中同名 Host 的设置会覆盖用户级配置。

### 安全注解

在 `Host` 块里写注释即可声明策略：

```sshconfig
# mcp-ssh:denylist = cmd1,cmd2      # 黑名单：阻止这些命令模式
# mcp-ssh:allowlist = cmd1,cmd2     # 白名单：仅允许这些命令模式
# mcp-ssh:maxTimeoutMs = 30000      # 该主机最大执行超时
# mcp-ssh:maxOutputChars = 5000     # 该主机最大输出字符数
```

### 认证顺序

1. **私钥认证**：来自 `IdentityFile`
2. **SSH Agent**：通过 `SSH_AUTH_SOCK`（Unix）或 Pageant（Windows）
3. **密码认证**：通过环境变量 `SSH_PASSWORD_<HOST>`

示例：主机 `my-server` 的密码可设置为 `SSH_PASSWORD_MY_SERVER=secret`。

## 为什么它比普通 SSH 包装器更值得用

| 普通远程执行桥 | SSH MCP Server |
|---|---|
| 往往直接暴露完整 Shell | 支持每主机 allowlist / denylist |
| 每一步都重新连接 | 复用连接池，减少重复握手 |
| 大输出容易把模型上下文塞满 | 自动截断输出 |
| 往往要重新定义主机配置 | 直接使用熟悉的 OpenSSH 语法 |
| 日志里容易混入敏感数据 | 自动脱敏并隐藏敏感值 |

## MCP 工具

| 工具 | 描述 | 参数 |
|------|------|------|
| `ssh_list_hosts` | 列出所有可用 SSH 主机 | — |
| `ssh_exec` | 在远程主机上执行命令 | `host`, `command`, `timeout_ms?` |
| `ssh_init_config` | 初始化 SSH 配置文件 | `scope`, `project_root?`, `hosts?` |
| `ssh_get_config` | 获取指定主机的配置 | `host` |
| `ssh_test_connection` | 测试主机连接 | `host` |
| `ssh_disconnect` | 断开指定主机或全部活动连接 | `host?` |

## MCP 资源

| URI | 描述 |
|-----|------|
| `ssh://hosts` | 所有已配置 SSH 主机的 JSON 列表 |

## 安全默认值

- 默认阻止 `rm -rf /`、`mkfs`、`dd if=`、`shutdown`、`reboot` 等危险命令
- 私钥内容和敏感环境变量会在输出中被脱敏
- 命令在执行前会做基础清理
- 并发连接数量和空闲连接寿命都有上限

生产环境建议：

1. 优先使用 `IdentityFile`，少用密码认证
2. 生产主机优先使用 `# mcp-ssh:allowlist`
3. 如果 `ssh.config` 包含敏感主机名，请加入 `.gitignore`
4. 生产环境建议启用 `--strict-host-key`
5. 尽量使用 SSH 证书或固定 `known_hosts`

## CLI 选项

```text
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

## 开发

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
```

## 贡献

欢迎提 Issue 和 PR。如果你希望支持更多 MCP 客户端、更严格的安全策略，或者更顺手的 SSH 工作流，直接提出来——好用的工具就是这样一点点磨出来的。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
