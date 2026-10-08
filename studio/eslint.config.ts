import js from "@eslint/js";
import tseslint from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import a11y from "eslint-plugin-jsx-a11y";
import { plugin as shadcn } from "@shadcn/lint";
export default tseslint.config(
  {
    ignores: ["node_modules/**", "../web/**"],
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    files: ["src/features/debugging/**/*.tsx", "src/features/devices/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/components/ui/tabs",
              importNames: ["TabsList", "TabsTrigger", "WorkspaceTab"],
              message: "작업 패널 탭은 PanelTabsList로 통일하세요.",
            },
          ],
        },
      ],
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks, "jsx-a11y": a11y },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      ...a11y.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.tsx"],
    plugins: { shadcn },
    rules: {
      "shadcn/no-raw-colors": "error",
      "shadcn/no-arbitrary-values": "error",
      "shadcn/no-inline-styles": "error",
      "shadcn/no-unknown-classes": "error",
      "shadcn/no-restyle": [
        "error",
        {
          allow: ["layout"],
          message:
            "{{component}}의 variant/size를 사용하세요. 공통 디자인은 components/ui에서 관리합니다.",
        },
      ],
      "shadcn/require-static-classes": "error",
    },
  },
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement[name.name=/^(input|textarea|select|dialog|style)$/]",
          message:
            "입력·대화상자는 공통 shadcn 컴포넌트를 사용하고, CSS는 styles.css에서 관리하세요.",
        },
        {
          selector:
            "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='className']",
          message:
            "버튼 스타일은 Button 또는 Item의 variant/size로 지정하세요. Item asChild 아래의 button에는 스타일을 추가하지 않습니다.",
        },
      ],
    },
  },
  {
    files: ["src/components/ui/**"],
    rules: {
      "shadcn/no-restyle": "off",
      "shadcn/no-arbitrary-values": "off",
      "shadcn/require-static-classes": "off",
    },
  },
);
