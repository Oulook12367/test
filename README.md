NaviCenter - 您的私人导航中心1. 项目简介NaviCenter 是一个高性能、安全、可自部署的个人导航/书签管理平台。它旨在成为您通往数字世界的个人化传送门，提供一个干净、快速、高度可定制的书签访问体验。项目后端基于 Cloudflare 的全球边缘网络构建，确保了极致的访问速度和高可用性。本项目不仅仅是一个简单的书签收藏夹，更是一个功能完善的、支持多用户、多角色的权限管理系统，并拥有一个功能强大的管理后台。2. 核心功能现代化主页：美观的 Glassmorphism (玻璃拟态) UI 设计。支持按层级、分组显示书签，视觉清晰。内置搜索引擎集成，可快速进行站内或网络搜索。响应式设计，完美适配桌面和移动设备。强大的管理后台：分类管理：支持无限层级的分类，通过行内编辑即可轻松排序和修改，并自动保存。书签管理：支持行内快速编辑，修改即自动保存，无需手动点击保存按钮。用户与权限管理：支持多用户系统。内置管理员、编辑员、访客三种角色。可为每个用户精确分配不同分类的访问权限。健壮的用户名和密码复杂度验证。系统工具：支持从浏览器导出的标准HTML文件批量导入书签。企业级后端架构：数据原子化：所有数据（用户、分类、书签）均独立存储于Cloudflare KV中，避免了并发写入冲突，确保数据安全。精细化API：所有数据操作均通过精准的RESTful API完成，高效且安全。后端缓存：利用Cloudflare Cache API对全站数据进行缓存，大幅减少KV读取次数，在降低成本的同时极大提升了加载速度。安全至上：密码使用加盐的PBKDF2哈希存储；API通过JWT进行无状态认证；管理员删除逻辑健壮，防止误删最后一个管理员。公共模式：可选择性开启“公共模式”，让未登录的访客也能查看您指定公开的分类和书签，适合作为团队或家庭的共享导航页。3. 技术栈前端: 原生 HTML, CSS, JavaScript (ES6+)，无框架，轻量快速。后端: Cloudflare Workers (Serverless Function)数据存储: Cloudflare KV (键值数据库)缓存: Cloudflare Cache API部署: Cloudflare Pages4. 部署与设置部署本项目非常简单，只需一个Cloudflare账户即可。代码部署:Fork本仓库。在Cloudflare控制台，选择 "Workers & Pages" -> "Create application" -> "Pages"。连接到您Fork的GitHub仓库，选择主分支。在构建设置 (Build settings) 中，进行如下配置：框架预设 (Framework preset): None构建命令 (Build command): npm install构建输出目录 (Build output directory): 留空或设置为项目根目录（如果您的静态文件在根目录）。点击“保存并部署”，Cloudflare将自动完成构建和部署。KV命名空间绑定:在Cloudflare控制台，选择 "Workers & Pages" -> "KV"。创建两个新的KV命名空间，例如：NAVI_DATA (用于存储主数据)NAVI_BACKUPS (用于存储定时备份)回到您部署的Pages项目，进入 "Settings" -> "Functions" -> "KV namespace bindings"。添加两个变量绑定：第一个:变量名称: NAVI_DATAKV 命名空间: 选择您创建的 NAVI_DATA。第二个:变量名称: NAVI_BACKUPSKV 命名空间: 选择您创建的 NAVI_BACKUPS。设置环境变量:在Pages项目的 "Settings" -> "Environment variables" 中，添加以下环境变量：PUBLIC_MODE_ENABLED:值: "true" - 开启公共模式，未登录用户可访问。值: "false" - 关闭公共模式，所有访问都需要登录。JWT_SECRET (可选):值: 一个您自己生成的、足够复杂的字符串（例如UUID）。如果不设置，系统将在首次运行时自动生成并存储在KV中。设置定时备份 (可选但强烈推荐):参考项目中的 backup-worker.js 文件，创建一个新的Worker服务。为这个新的Worker绑定上面创建的NAVI_DATA和NAVI_BACKUPS两个KV空间。为该Worker添加一个Cron Trigger（定时触发器），例如设置为 0 * * * * 来实现每小时备份。首次运行:部署完成后，首次访问您的管理后台 (/admin.html)。系统会自动检测到是首次运行，并为您初始化以下默认账户：管理员: admin / admin123 (请务必在登录后立即修改密码！)公共账户: public (用于配置公共模式下的可见内容)5. 项目结构简介.
├── functions
│   └── _middleware.js  # 主API后端逻辑 (代码一)
├── index.html          # 主导航页
├── login.html          # 登录页
├── admin.html          # 管理后台页
├── style.css           # 全局样式表
├── shared.js           # 前后端共用的JS工具函数
├── main.js             # 主导航页的逻辑
├── login.js            # 登录页的逻辑
├── admin-core.js       # 管理后台核心JS
├── admin-categories.js # 分类管理JS
├── admin-bookmarks.js  # 书签管理JS
├── admin-users.js      # 用户管理JS
├── admin-system.js     # 系统工具JS
├── backup-worker.js    # (独立的)备份Worker脚本
├── package.json        # 项目依赖
└── .nvmrc              # Node.js版本锁定
