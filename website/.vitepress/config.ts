import process from "node:process";
import { defineConfig } from "vitepress";

const base = process.env.PWA_DOCS_BASE ?? "/";

export default defineConfig({
  base,
  lang: "zh-CN",
  title: "PWA Platform",
  description: "PWA Platform 开发者文档",
  cleanUrls: true,
  lastUpdated: true,
  head: [["link", { rel: "icon", type: "image/svg+xml", href: base + "favicon.svg" }]],
  themeConfig: {
    siteTitle: "PWA Platform",
    nav: [
      { text: "认识平台", link: "/introduction/" },
      { text: "开始接入", link: "/start/choose" },
      { text: "能力指南", link: "/guide/configuration" },
      { text: "架构", link: "/architecture/" },
      { text: "参考", link: "/reference/packages" },
    ],
    sidebar: [
      {
        text: "认识平台",
        items: [
          { text: "项目介绍", link: "/introduction/" },
          { text: "能力与边界", link: "/introduction/capabilities" },
        ],
      },
      {
        text: "开始接入",
        items: [
          { text: "选择接入包", link: "/start/choose" },
          { text: "Vue 项目", link: "/start/vue" },
          { text: "React 项目", link: "/start/react" },
          { text: "上线前检查", link: "/start/checklist" },
        ],
      },
      {
        text: "能力指南",
        items: [
          { text: "身份与策略配置", link: "/guide/configuration" },
          { text: "离线体验", link: "/guide/offline" },
          { text: "公共读取缓存", link: "/guide/public-read-cache" },
          { text: "安装与更新", link: "/guide/updates" },
          { text: "从 vite-plugin-pwa 迁移", link: "/guide/migration" },
          { text: "常见问题", link: "/guide/troubleshooting" },
          { text: "可选能力", link: "/guide/optional" },
        ],
      },
      {
        text: "架构设计",
        items: [
          { text: "分层与构建链路", link: "/architecture/" },
          { text: "缓存安全模型", link: "/architecture/security" },
          { text: "运行时生命周期", link: "/architecture/lifecycle" },
        ],
      },
      {
        text: "参考与发布",
        items: [
          { text: "包与公开入口", link: "/reference/packages" },
          { text: "兼容范围", link: "/reference/compatibility" },
          { text: "部署与发布", link: "/operations/release" },
        ],
      },
    ],
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "搜索", buttonAriaLabel: "搜索文档" },
              modal: {
                displayDetails: "显示详细列表",
                resetButtonTitle: "清除搜索",
                backButtonTitle: "关闭搜索",
                noResultsText: "没有找到结果",
                footer: {
                  selectText: "选择",
                  selectKeyAriaLabel: "回车",
                  navigateText: "切换",
                  navigateUpKeyAriaLabel: "上箭头",
                  navigateDownKeyAriaLabel: "下箭头",
                  closeText: "关闭",
                  closeKeyAriaLabel: "Esc",
                },
              },
            },
          },
        },
      },
    },
    outline: { level: [2, 3], label: "本页内容" },
    docFooter: { prev: "上一页", next: "下一页" },
    darkModeSwitchLabel: "主题",
    sidebarMenuLabel: "目录",
    returnToTopLabel: "回到顶部",
  },
});
