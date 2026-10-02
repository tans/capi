import * as React from "react";

export type Brand = {
  name: string;
  logoUrl: string;
  supportEmail: string;
  supportUrl: string;
};

export const defaultBrand: Brand = {
  name: "CAPI",
  logoUrl: "",
  supportEmail: "support@capi.minapp.xin",
  supportUrl: "",
};

const BrandContext = React.createContext<Brand>(defaultBrand);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const [brand, setBrand] = React.useState<Brand>(defaultBrand);
  React.useEffect(() => {
    fetch("/api/public/brand", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => value && setBrand({ ...defaultBrand, ...value }))
      .catch(() => undefined);
  }, []);
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return React.useContext(BrandContext);
}
