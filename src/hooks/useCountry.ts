"use client";

import { useState, useEffect } from "react";

export function useCountry() {
  const [country, setCountry] = useState<string | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem("country");
    if (cached) {
      setCountry(cached);
      return;
    }

    fetch("https://ipapi.co/json/")
      .then((res) => res.json())
      .then((data) => {
        if (data.country_code) {
          sessionStorage.setItem("country", data.country_code);
          setCountry(data.country_code);
        }
      })
      .catch(() => {});
  }, []);

  return country;
}
