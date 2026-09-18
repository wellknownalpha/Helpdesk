import { db } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

export default async function ArticlePage({ params }: { params: { id: string } }) {
  const article = await db.knowledgeArticle.findUnique({ where: { id: params.id } });
  if (!article) notFound();
  await db.knowledgeArticle.update({ where: { id: params.id }, data: { views: { increment: 1 } } });
  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <p className="text-xs text-muted-foreground">{article.category} · {article.views + 1} views · {formatDate(article.updatedAt)}</p>
        <CardTitle className="text-2xl">{article.title}</CardTitle>
      </CardHeader>
      <CardContent><p className="whitespace-pre-wrap">{article.content}</p></CardContent>
    </Card>
  );
}
