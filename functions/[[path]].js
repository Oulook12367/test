// --- 临时诊断代码 ---
// (完成测试后，请恢复您原来的代码)

export async function onRequest(context) {
  // 从上下文中获取 env 对象
  const { env } = context;

  console.log("--- 开始诊断日志 ---");

  // 检查 env 对象中是否存在我们需要的每个键
  const naviDataExists = env.NAVI_DATA ? 'OK - 已找到' : '错误 - 缺失!';
  const naviBackupsExists = env.NAVI_BACKUPS ? 'OK - 已找到' : '错误 - 缺失!';
  const jwtSecretExists = env.JWT_SECRET ? 'OK - 已找到' : '错误 - 缺失!';

  // 准备一份报告，既打印到日志，也返回到浏览器
  const report = `
Cloudflare Function 环境诊断报告:
------------------------------------
1. KV绑定 'NAVI_DATA': ${naviDataExists}
2. KV绑定 'NAVI_BACKUPS': ${naviBackupsExists}
3. 环境变量 'JWT_SECRET': ${jwtSecretExists}

- 如果有任何一项显示 "错误 - 缺失!"，则说明该项配置未成功应用，这就是导致您应用崩溃的根本原因。
- 如果全部显示 "OK - 已找到"，请告知我们，我们将进行下一步排查。
`;

  // 将报告打印到Cloudflare的后台日志中
  console.log(report);
  console.log("--- 诊断日志结束 ---");

  // 将报告直接返回给浏览器，方便查看
  return new Response(report, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
