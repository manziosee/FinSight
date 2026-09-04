import nextConfig from "eslint-config-next";
import nextTypescript from "eslint-config-next/typescript";

const config = [...nextConfig, ...nextTypescript, { ignores: [".next/**", "node_modules/**"] }];

export default config;
