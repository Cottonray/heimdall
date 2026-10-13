import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Session } from "../../../../contracts/studio";
export function ScenarioPlanView({ session }: { session: Session }) {
  const plan = session.plan!;
  return <div className="min-h-0 flex-1 overflow-auto p-6 space-y-6">
    <PageHeader title={session.name} description={plan.summary} actions={<Badge variant="secondary">앱 · 초안 · 미실행</Badge>} />
    <Card><CardHeader><CardTitle>실행 준비</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm">대상 앱: {plan.appPackage}</p>
      {plan.prerequisites.map((item) => <p key={item} className="text-sm text-muted-foreground">{item}</p>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>테스트데이터</CardTitle></CardHeader><CardContent className="space-y-3">
      {plan.data.map((item) => <p key={item.name} className="text-sm"><strong>{item.name}</strong> · {item.description}</p>)}
    </CardContent></Card>
    {plan.steps.map((step, index) => <Card key={step.title}><CardHeader><CardTitle>{index + 1}. {step.title}</CardTitle></CardHeader><CardContent className="space-y-3">
      <p className="text-sm">{step.action}</p><p className="text-sm"><strong>기대 결과</strong> · {step.expected}</p><p className="break-all text-xs text-muted-foreground">소스: {step.source}</p>
    </CardContent></Card>)}
    <Card><CardHeader><CardTitle>분기 검증</CardTitle></CardHeader><CardContent className="space-y-3">
      {plan.branches.map((item) => <div key={item.title} className="space-y-1"><p className="text-sm"><strong>{item.title}</strong> · {item.expected}</p><p className="text-xs text-muted-foreground">소스: {item.source}</p></div>)}
    </CardContent></Card>
  </div>;
}
