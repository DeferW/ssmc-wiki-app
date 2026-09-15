import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { XenoEvasionList } from "./XenoEvasionList";
import type { MobCatalog } from "../mobTypes";

it("lists new castes from the catalog, with signed evasion and strain names", () => {
 const catalog = { evasionSchemaVersion: 1, xenoCastes: {
  new: {id:"new",name:"Новый ксено",strainName:"Штамм",evasion:{standing:20}},
  big: {id:"big",name:"Крупный",strainName:null,evasion:{standing:-10}},
  zero: {id:"zero",name:"Нулевой",evasion:{standing:0}},
 } } as unknown as MobCatalog;
 const html = renderToStaticMarkup(<XenoEvasionList catalog={catalog} loading={false} error={null} />);
 expect(html).toContain("Новый ксено (Штамм)"); expect(html).toContain("+20");
 expect(html).toContain("-10"); expect(html).not.toContain("Нулевой");
 expect(html).not.toContain("open=");
});
it("distinguishes an old catalog from a catalog with no evasion", () => {
 const html = renderToStaticMarkup(<XenoEvasionList catalog={{xenoCastes:{}} as MobCatalog} loading={false} error={null} />);
 expect(html).toContain("пока нет данных");
});
