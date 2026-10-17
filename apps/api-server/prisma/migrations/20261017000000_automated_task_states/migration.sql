-- 结果不确定不再需要人工复核：`NEEDS_REVIEW` 改名为 `AUTO_VERIFICATION`，由后台扫描器
-- 在超时后自动收尾。`WAITING_USER` 保留原名，表示 CAPTCHA 等安全验证需要人工完成。
ALTER TYPE "TaskStatus" RENAME VALUE 'NEEDS_REVIEW' TO 'AUTO_VERIFICATION';

-- 活动任务部分唯一索引内嵌了状态列表，因此按新名字重建。
DROP INDEX IF EXISTS "tasks_one_active_per_account";
DROP INDEX IF EXISTS "tasks_one_active_per_worker";

CREATE UNIQUE INDEX "tasks_one_active_per_account" ON "tasks"("account_id") WHERE "status" IN ('PENDING', 'CLAIMED', 'RUNNING', 'WAITING_USER', 'PAUSED', 'AUTO_VERIFICATION');
CREATE UNIQUE INDEX "tasks_one_active_per_worker" ON "tasks"("worker_id") WHERE "worker_id" IS NOT NULL AND "status" IN ('CLAIMED', 'RUNNING', 'WAITING_USER', 'PAUSED', 'AUTO_VERIFICATION');
