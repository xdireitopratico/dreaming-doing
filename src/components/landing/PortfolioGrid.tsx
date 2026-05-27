import { motion } from "motion/react";
import portfolioPhoto from "@/assets/showcase/portfolio-photo.jpg";
import crmSaas from "@/assets/showcase/crm-saas.jpg";
import bakeryShop from "@/assets/showcase/bakery-shop.jpg";
import financeDash from "@/assets/showcase/finance-dash.jpg";
import editorialBlog from "@/assets/showcase/editorial-blog.jpg";
import slidesBuilder from "@/assets/showcase/slides-builder.jpg";

const items = [
  { img: portfolioPhoto, title: "Portfólio fotográfico", meta: "Site · 1h de prompt" },
  { img: crmSaas, title: "CRM interno", meta: "App SaaS · Supabase · 6h" },
  { img: bakeryShop, title: "Padaria artesanal", meta: "E-commerce · 3h" },
  { img: financeDash, title: "Painel financeiro pessoal", meta: "Dashboard · 4h" },
  { img: editorialBlog, title: "Revista editorial", meta: "Blog · RLS · 2h" },
  { img: slidesBuilder, title: "Construtor de slides", meta: "App · 8h" },
];

export function PortfolioGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {items.map((it, i) => (
        <motion.a
          key={it.title}
          href="#"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, delay: i * 0.05 }}
          whileHover={{ y: -4 }}
          className="group block rounded-2xl overflow-hidden border border-border bg-surface/40 shadow-[var(--shadow-soft)]"
        >
          <div className="aspect-video overflow-hidden bg-background">
            <img
              src={it.img}
              alt={it.title}
              loading="lazy"
              width={1280}
              height={768}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          </div>
          <div className="p-4 flex items-baseline justify-between gap-3">
            <div className="font-display text-lg leading-tight">{it.title}</div>
            <div className="text-[11px] font-mono text-muted-foreground shrink-0">{it.meta}</div>
          </div>
        </motion.a>
      ))}
    </div>
  );
}
