import { supabase } from "@/lib/supabase";
import ProductCard from "@/components/products/ProductCard";
import NotionProductImporter from "@/components/products/NotionProductImporter";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { data: products } = await supabase
    .from("products")
    .select("*, pillar:pillars(name, color)")
    .eq("status", "active")
    .order("name");

  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-white">📦 Products</h1>
        <p className="text-gray-400 mt-1">Manage which Notion products to track</p>
      </div>

      {/* Step 1: Import from Notion */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/50 p-6">
        <NotionProductImporter />
      </section>

      {/* Step 2: Active product cards with live tasks */}
      {products && products.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Active Products</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
