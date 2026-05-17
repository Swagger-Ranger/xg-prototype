`test` 是协作出口，`xg-prototype` 远端是入口——你只从同事的 `xg-prototype` 远端读，从来不写。

这样有两个好处：

1. 冲突永远在你本地发生——同事侧零冲突解决。
2. 同事 pull `test` 时几乎不会冲突——因为你合并时已经"吸收"了他的提交历史，git 知道这些 commit 双方共有，不会要求他再次解决。

唯一的例外：同事 push 之后、你 push 之前，他又继续修改了你也在改的同一行——这种小概率情况才会让他 pull `test` 时再冒出冲突。所以约定上还是建议他 push 备份后等你合完再继续开发，或者只动业务文件、别动架构/部署相关的东西。



```mermaid
sequenceDiagram
    autonumber
    participant C as 岳兴 (本地 xg-prototype)
    participant XP as 远端 xg-prototype<br/>(同事的"备份+申请合并"槽位)
    participant T as 远端 test<br/>(集成出口，单向)
    participant M as 刘斐 (本地 xg-product)

    Note over M,C: 平时各自开发，互不打扰
    par
        M->>M: 在 xg-product 改架构/部署
    and
        C->>C: 在 xg-prototype 写业务
    end

    rect rgb(255, 243, 205)
        Note over C,M: 合并触发：岳兴完成一个阶段，想同步刘斐的架构改动
        C->>C: git commit
        C->>XP: git push origin xg-prototype<br/>(备份 + 通知刘斐可以合xg-prototype了)
    end

    rect rgb(209, 236, 241)
        Note over M: 刘斐来处理合并（同事此时停手等结果）
        M->>XP: git fetch origin xg-prototype
        M->>M: 在 xg-product 上 merge origin/xg-prototype<br/>解决冲突
        M->>T: git push origin xg-product:test
        M-->>C: 通知"可以拉了"
    end

    rect rgb(212, 237, 218)
        Note over C: 岳兴从 test 拉回，理论上 0 冲突
        C->>T: git fetch origin
        C->>C: git merge origin/test<br/>(自己的提交已在 test 里，git 自动识别)
        Note over C: 继续业务开发
    end

```



**提醒同事岳兴的两件事**

1. push 完 `xg-prototype` 后，先别继续改你可能也在动的文件（架构、部署、共用配置）。改纯业务代码可以继续。
2. 如果他 `git merge origin/test` 还是冒出冲突（小概率），说明确实是上面那种"重叠修改"撞上了——这时还是按老办法：`merge --abort` → 再 push 一次 `xg-prototype` → 你再合一次。流程是闭环的，多走一遍就行。













