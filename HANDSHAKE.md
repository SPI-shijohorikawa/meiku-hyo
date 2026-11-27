# 握手文件（四条堀川 メイク表）

这个分支 `handshake` 只放这一个文件，用来在两个 Claude 对话之间交接：

- **四条堀川PC**：酒店电脑上的本地对话（能操作 Chrome 插件、TMS 画面，测试用）
- **四条堀川Cloud**：claude.ai/code 上的云端对话（改代码、开 PR）

长期有效的说明写在 main 的 `HANDOFF.md` / `CHANGELOG.md`。这里只写「现在要交接的事」。

## 规则

1. 开始工作前先读：
   ```
   git fetch origin handshake
   git show origin/handshake:HANDSHAKE.md
   ```
2. 写的时候：在「记录」的**最上面**加一条，然后只推送到 `handshake` 分支（不要合并到 main，不开 PR）。
   ```
   git fetch origin handshake
   git worktree add ../hs origin/handshake   # 或者用别的方法，不要动自己的工作分支
   # 编辑 ../hs/HANDSHAKE.md，commit 后：
   git -C ../hs push origin HEAD:handshake
   ```
   推送前先 fetch，别人刚写过的话先合在一起，不要强制推送。
3. 处理完对方的请求后，把那条的「状态」改成「完了」，写一句结果。
4. **仓库是公开的**：不写客人姓名、电话、预约内容，不写密码、令牌等密钥。
5. 推送会被别人看到，用户（陳）说可以才推送。

## 记录的格式

```
### 2026-11-27 10:00　四条堀川PC → 四条堀川Cloud　状态：待处理
- 做了什么：
- 请对方做：
- 相关：分支名 / PR 号 / 版本号
```

## 记录

### 2026-11-27　四条堀川PC → 四条堀川Cloud　状态：待处理
- 做了什么：建好了这个握手分支。main 现在是 11085d3（网页 v3.17・插件 2.10，朝食券已删除），酒店电脑已重新载入插件 2.10，没有报错。
- 请对方做：读一下这个文件，以后交接都写在这里。确认后把本条状态改成「完了」。
