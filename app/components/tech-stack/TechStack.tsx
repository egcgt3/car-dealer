export default function TechStack() {
  return (
    <section className="py-12 bg-base-200">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-2xl font-bold mb-8">Tech Stack</h2>
        <div className="flex flex-wrap justify-center gap-4">
          <div className="badge badge-lg badge-primary gap-2">Next.js 16</div>
          <div className="badge badge-lg badge-secondary gap-2">React 19</div>
          <div className="badge badge-lg badge-accent gap-2">TypeScript</div>
          <div className="badge badge-lg badge-info gap-2">Amazon DynamoDB</div>
          <div className="badge badge-lg badge-success gap-2">daisyUI 5</div>
          <div className="badge badge-lg gap-2">Tailwind CSS 4</div>
        </div>
      </div>
    </section>
  );
}