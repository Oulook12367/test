一个自托管的个人导航主页。基于 Cloudflare Pages 和 KV 构建。



## 🚀 部署与配置

部署本项目非常简单，你只需要一个 Cloudflare 账户。

### 1. 准备项目

将本项目的所有文件（`index.html`, `style.css`, `app.js`以及 `functions` 文件夹）上传到你的 GitHub 仓库。

### 2. 创建 Cloudflare Pages 项目

1.  登录到你的 Cloudflare 仪表板。
2.  在左侧菜单中，转到 **Workers & Pages** > **Pages**。
3.  点击 **Create a project** 并选择 **Connect to Git**。
4.  选择你刚才上传代码的 GitHub 仓库。
5.  在 **Build settings** 中，框架预设选择 `None`。构建命令:npm install。构建输出:public。
6.  点击 **Save and Deploy**。

### 3. 配置 KV 数据库

项目需要两个 KV 命名空间来存储数据。

1.  在 Cloudflare 仪表板中，转到 **Workers & Pages** > **KV**。
2.  创建两个新的命名空间：
    * `NAVI_DATA` (用于存储主数据)
    * `NAVI_BACKUPS` (用于存储备份)
3.  回到你刚刚创建的 Pages 项目的设置页面 (**Settings** > **Functions** > **KV namespace bindings**)。
4.  绑定这两个命名空间：
    * 变量名称: `NAVI_DATA` → 绑定到你创建的 `NAVI_DATA` KV 命名空间。
    * 变量名称: `NAVI_BACKUPS` → 绑定到你创建的 `NAVI_BACKUPS` KV 命名空间。
5.  点击 **Save**。

### 4. 配置环境变量

1.  在你的 Pages 项目设置页面 (**Settings** > **Environment variables**)，为 **Production** 和 **Preview** 环境添加以下变量：

    * **`JWT_SECRET`**
        * **用途**: 用于签名和验证用户登录凭证，必须保密。
        * **值**: 一个长且随机的字符串。你可以使用密码生成器或 `openssl rand -base64 32` 命令生成一个。
        * *示例值*: `aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890!@#$%^&*()`

    * **`PUBLIC_MODE_ENABLED`** (可选)
        * **用途**: 控制是否开启公共访问模式。
        * **值**:
            * `true`: 开启公共模式，未登录访客可以看到指定内容。
            * 理论不设置或设为其他值: 建议false，关闭公共模式，所有访问者都必须登录。

2.  保存环境变量后，**重新部署**你的项目以使新设置生效。

---

## 📖 使用指南

1.  **首次登录**
    * 部署成功后，访问你的 Pages 域名。
    * 使用默认管理员账户登录：
        * **用户名**: `admin`
        * **密码**: `admin123`
    * 🚨 **安全警告**: 首次登录后，请**务必**立即进入“用户管理”界面，修改 `admin` 用户的密码，或直接删除 `admin` 并创建一个新的管理员账户，请勿设置用户名为`public`，会被禁止登录。

2.  **配置公共内容 (如果开启了公共模式)**
    * 以管理员身份登录，进入“用户管理”。
    * 你会看到一个名为 `public` 的特殊用户。
    * 点击 `public` 用户进行编辑，在“可见分类”中勾选你希望公开访客看到的分类。
    * 保存即可。
