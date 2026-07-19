module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react/jsx-runtime",
    "plugin:react-hooks/recommended",
  ],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: "detect" } },
  ignorePatterns: ["dist", "node_modules"],
  rules: {
    // C'est la regle qui aurait attrape le bug "Icon is not defined" :
    // un composant JSX utilise sans import correspondant.
    "no-undef": "error",
    // Autorise le pattern `const {a, b, ...rest} = obj` pour exclure des
    // champs avant un payload (ex. TheoryOfChange.jsx submitEdit) sans
    // que a/b remontent comme "non utilisees".
    "no-unused-vars": ["warn", { ignoreRestSiblings: true }],
    // Le projet n'utilise pas PropTypes (pas de validation de types en
    // JS pur) : cette regle ne ferait que du bruit sur chaque composant.
    "react/prop-types": "off",
    // Le style du projet ecrit du francais sans echapper les apostrophes.
    "react/no-unescaped-entities": "off",
  },
};
