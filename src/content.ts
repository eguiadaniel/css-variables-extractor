// console.log("Script started");

// Inicializar variables globales
window.extractedData = {
  mainCss: { info: {}, variables: [] },
  defaultCss: { info: {}, variables: [] },
  currentStory: { info: {}, variables: [] },
};
window.currentVariables = {};

interface ExtractedData {
  mainCss: { info: {}; variables: CSSVariable[] };
  defaultCss: { info: {}; variables: CSSVariable[] };
  currentStory: { info: {}; variables: CSSVariable[] };
}

interface CSSVariable {
  id: string;
  name: string;
  selector: string;
  value: string;
  resolvedValue: string; // This will store the final computed value
  alias: string | null;
  aliasOrigin: string | null; // This will store the highest ancestor in the chain
  origin: string;
  inCurrentStory: boolean;
}

let extractedData: ExtractedData = {
  mainCss: { info: {}, variables: [] },
  defaultCss: { info: {}, variables: [] },
  currentStory: { info: {}, variables: [] },
};

let currentVariables: { [key: string]: string } = {};
let allVariables: CSSVariable[] = [];

chrome.runtime.onMessage.addListener(
  (
    request: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) => {
    // console.log("Message received in content script:", request);
    if (request.action === "extract") {
      extractAllRelevantCSSVariables()
        .then((cssVariables) => {
          // Update currentVariables with the extracted data
          allVariables = cssVariables;
          currentVariables = {};
          cssVariables.forEach((v) => {
            currentVariables[v.name] = v.value;
          });

          // console.log("Extracted and updated currentVariables:");
          // console.log("cssVariables", cssVariables);
          // console.log("currentVariables", currentVariables);
          sendResponse({ variables: cssVariables }); // Send the full array of CSSVariables
        })
        .catch((error) => {
          console.error("Error extracting CSS variables:", error);
          sendResponse({ error: "Error extracting CSS variables" });
        });
      return true; // Indicates we wish to send a response asynchronously
    } else if (request.action === "import") {
      currentVariables = request.variables;
      applyCSSVariablesToShowcasedComponent(currentVariables);
      sendResponse({ success: true });
    } else if (request.action === "updateVariable") {
      updateVariable(request.variable);
      sendResponse({ success: true, currentVariables: currentVariables });
    } else if (request.action === "exportVariables") {
      sendResponse({ variables: allVariables });
    }
  }
);

async function extractAllRelevantCSSVariables(): Promise<CSSVariable[]> {
  // console.log("extractAllRelevantCSSVariables called");
  const iframe = document.getElementById(
    "storybook-preview-iframe"
  ) as HTMLIFrameElement | null;
  if (!iframe) {
    console.error("Storybook iframe not found");
    return [];
  }

  const iframeDocument =
    iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDocument) {
    console.error("Unable to access iframe document");
    return [];
  }

  const showcasedComponent = findShowcasedComponent(iframeDocument);
  if (!showcasedComponent) {
    console.error("Showcased component not found");
    return [];
  }

  const relevantSelectors = getAllRelevantSelectors(showcasedComponent);

  const mainStylesheet = iframeDocument.querySelector(
    'link[href="main.css"]'
  ) as HTMLLinkElement | null;
  const skinStylesheet = iframeDocument.querySelector(
    "link#skin-stylesheet"
  ) as HTMLLinkElement | null;

  if (!mainStylesheet || !skinStylesheet) {
    console.error("One or both stylesheets not found");
    return [];
  }

  const mainCssVariables = await extractCSSVariablesForSelectors(
    mainStylesheet.href,
    "mainCss",
    "main",
    relevantSelectors
  );
  const defaultCssVariables = await extractCSSVariablesForSelectors(
    skinStylesheet.href,
    "defaultCss",
    "skin",
    relevantSelectors
  );

  const mainStoryVariables = await extractCSSVariablesForSelectors(
    mainStylesheet.href,
    "currentStory",
    "main",
    relevantSelectors
  );
  const skinStoryVariables = await extractCSSVariablesForSelectors(
    skinStylesheet.href,
    "currentStory",
    "skin",
    relevantSelectors
  );
  const variableMap = new Map<string, CSSVariable>();

  [
    ...mainCssVariables,
    ...defaultCssVariables,
    ...mainStoryVariables,
    ...skinStoryVariables,
  ].forEach((variable) => {
    const existingVariable = variableMap.get(variable.name);
    if (!existingVariable || variable.inCurrentStory) {
      variableMap.set(variable.name, variable);
    }
  });

  const allVariables = Array.from(variableMap.values());

  // console.log("extractAllRelevantCSSVariables()", allVariables);
  return allVariables;
}

function findShowcasedComponent(doc: Document): Element | null {
  // console.log("findShowcasedComponent called");
  const selectors = [
    "#storybook-root > storybook-root > *:not(storybook-root)",
    "#storybook-root > *:not(storybook-root)",
    "#storybook-root storybook-root > *:not(storybook-root)",
    "#root > *",
    ".sb-show-main > *",
  ];

  for (let selector of selectors) {
    const elements = doc.querySelectorAll(selector);
    for (let element of elements) {
      // console.log("element", element);
      if (
        element.tagName.toLowerCase() !== "storybook-root" &&
        !element.tagName.toLowerCase().startsWith("ng-")
      ) {
        return element;
      }
    }
  }

  const rootChildren = doc.querySelectorAll("#storybook-root > *");
  for (let child of rootChildren) {
    if (child.tagName.toLowerCase() !== "storybook-root") {
      // console.log("child", child);
      return child;
    }
  }

  console.error("Could not find showcased component");
  return null;
}

function getAllRelevantSelectors(element: Element): string[] {
  const selectors = new Set<string>();

  function addSelectorsForElement(el: Element) {
    selectors.add(el.tagName.toLowerCase());
    el.classList.forEach((className) => selectors.add("." + className));
    if (el.id) selectors.add("#" + el.id);

    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i];
      if (attr.name !== "class" && attr.name !== "id") {
        selectors.add(`[${attr.name}]`);
      }
    }

    for (let i = 0; i < el.children.length; i++) {
      addSelectorsForElement(el.children[i]);
    }
  }

  addSelectorsForElement(element);
  return Array.from(selectors);
}

async function extractCSSVariablesForSelectors(
  stylesheetUrl: string,
  sourceKey: string,
  origin: string,
  relevantSelectors: string[] | null
): Promise<CSSVariable[]> {
  try {
    const response = await fetch(stylesheetUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const cssText = await response.text();
    return extractVariablesFromText(
      cssText,
      sourceKey,
      origin,
      relevantSelectors
    );
  } catch (error) {
    console.error(`Error fetching stylesheet ${stylesheetUrl}:`, error);
    return [];
  }
}

function extractVariablesFromText(
  cssText: string,
  sourceKey: string,
  origin: string,
  relevantSelectors: string[] | null
): CSSVariable[] {
  // console.log(`Extracting variables from ${sourceKey}`);
  const variables: CSSVariable[] = [];
  const variableMap = new Map<string, CSSVariable>();

  // Create a temporary document and style element
  const tempDoc = document.implementation.createHTMLDocument();
  const styleElement = tempDoc.createElement("style");
  styleElement.textContent = cssText;
  tempDoc.body.appendChild(styleElement);

  const styleSheet = styleElement.sheet as CSSStyleSheet;
  if (!styleSheet) {
    console.error("Failed to create stylesheet from cssText");
    return variables;
  }

  // console.log(`Number of CSS rules: ${styleSheet.cssRules.length}`);

  // First pass: extract all variables
  for (let i = 0; i < styleSheet.cssRules.length; i++) {
    const rule = styleSheet.cssRules[i];
    if (rule.type === CSSRule.STYLE_RULE) {
      const styleRule = rule as CSSStyleRule;
      const inCurrentStory =
        relevantSelectors === null ||
        ruleMatchesSelectors(styleRule, relevantSelectors);

      const styleText = styleRule.style.cssText;
      const variableRegex = /(--.+?):\s*([^;]+)/g;
      let match;
      while ((match = variableRegex.exec(styleText)) !== null) {
        const varName = match[1].trim();
        const varValue = match[2].trim();

        variableMap.set(varName, {
          id: `${sourceKey}-${varName.substring(2)}`,
          name: varName,
          selector: styleRule.selectorText,
          value: varValue,
          resolvedValue: varValue, // Will be updated in the second pass
          alias: varValue.startsWith("var(")
            ? varValue.match(/var\((.*?)\)/)?.[1] || null
            : null,
          aliasOrigin: null, // Will be updated in the second pass
          origin: origin,
          inCurrentStory: inCurrentStory,
        });
      }
    }
  }

  // Second pass: resolve values and find highest ancestors
  for (const variable of variableMap.values()) {
    const [resolvedValue, aliasOrigin] = resolveVariableValueAndOrigin(
      variable.value,
      variableMap
    );
    variable.resolvedValue = resolvedValue;
    variable.aliasOrigin = aliasOrigin;
    variables.push(variable);
  }

  // console.log(`Extracted ${variables.length} variables from ${sourceKey}`);
  return variables;
}

function resolveVariableValueAndOrigin(
  value: string,
  variableMap: Map<string, CSSVariable>
): [string, string | null] {
  if (!value.startsWith("var(")) {
    return [value, null];
  }

  const varName = value.match(/var\((.*?)\)/)?.[1];
  if (!varName) return [value, null];

  const variable = variableMap.get(varName);
  if (!variable) return [value, null];

  const [resolvedValue, aliasOrigin] = resolveVariableValueAndOrigin(
    variable.value,
    variableMap
  );
  return [resolvedValue, aliasOrigin || varName];
}

function ruleMatchesSelectors(
  rule: CSSStyleRule,
  selectors: string[]
): boolean {
  if (!selectors || selectors.length === 0) {
    return true; // If no selectors provided, match all rules
  }
  const ruleSelectors = rule.selectorText.split(",").map((s) => s.trim());
  return ruleSelectors.some((selector) => selectors.includes(selector));
}

let currentCSSVariables: { [key: string]: string } = {};

function applyCSSVariablesToShowcasedComponent(variables: {
  [key: string]: string;
}): void {
  const iframe = document.getElementById(
    "storybook-preview-iframe"
  ) as HTMLIFrameElement | null;
  if (!iframe) {
    console.error("Storybook iframe not found");
    return;
  }

  try {
    const iframeDocument =
      iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDocument) {
      console.error("Unable to access iframe document");
      return;
    }
    const showcasedComponent = findShowcasedComponent(iframeDocument);
    if (!showcasedComponent) {
      console.error("Showcased component not found");
      return;
    }

    // Aplicar inline style a todos los hijos porque desde la lista de variables, no sabemos a que elementos se le aplica.
    applyVariablesToElementAndChildren(showcasedComponent, variables);

    // Actualizar las variables CSS actuales
    Object.assign(currentCSSVariables, variables);

    // Buscar o crear un elemento de estilo único
    let styleElement = iframeDocument.head.querySelector(
      "style#dynamic-variables"
    ) as HTMLStyleElement;
    if (!styleElement) {
      styleElement = iframeDocument.createElement("style");
      styleElement.id = "dynamic-variables";
      iframeDocument.head.appendChild(styleElement);
    }

    // Generar el contenido CSS
    let css = ":root {\n";
    for (const [key, value] of Object.entries(currentCSSVariables)) {
      css += `  ${key}: ${value} !important;\n`;
    }
    css += "}";

    // Actualizar el contenido del elemento de estilo
    styleElement.textContent = css;
  } catch (e) {
    console.error("Error applying CSS variables:", e);
  }
}

function applyVariablesToElementAndChildren(
  element: Element,
  variables: { [key: string]: string }
): void {
  for (const [key, value] of Object.entries(variables)) {
    (element as HTMLElement).style.setProperty(key, value);
  }

  for (let i = 0; i < element.children.length; i++) {
    applyVariablesToElementAndChildren(element.children[i], variables);
  }
}

function updateVariable(variable: { [key: string]: string }): void {
  Object.assign(currentVariables, variable);
  // console.log("updateVariable --> currentVariables", currentVariables);
  applyCSSVariablesToShowcasedComponent(variable);
}

extractAllRelevantCSSVariables()
  .then((cssVariables) => {
    // console.log("Initial extraction complete:", cssVariables);
    currentVariables = {};
    cssVariables.forEach((v) => (currentVariables[v.name] = v.value));
    // console.log("Extracted and updated currentVariables:", currentVariables);
  })
  .catch((error) => {
    console.error("Error extracting CSS variables:", error);
  });

// At the end of the file, add:
// console.log("Content script loaded. Current variables:", currentVariables);
