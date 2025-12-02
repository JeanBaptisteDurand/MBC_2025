// ============================================
// Source Code Routes
// ============================================

import { Router } from "express";
import type { SourceCodeResponse } from "@baselens/core";
import { prisma } from "../db/prismaClient.js";
import { logger } from "../logger.js";

const router = Router();

// ============================================
// GET /api/source/:analysisId/:address - Get source code for a contract
// ============================================

router.get("/:analysisId/:address", async (req, res) => {
  try {
    const { analysisId, address } = req.params;
    const normalizedAddress = address.toLowerCase();

    // Get contract
    const contract = await prisma.contract.findFirst({
      where: {
        analysisId,
        address: normalizedAddress,
      },
    });

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    // Get source files
    const sourceFiles = await prisma.sourceFile.findMany({
      where: {
        analysisId,
        contractAddress: normalizedAddress,
      },
    });

    const response: SourceCodeResponse = {
      address: contract.address,
      sourceType: contract.sourceType as SourceCodeResponse["sourceType"],
      files: sourceFiles.map((f) => ({
        path: f.path,
        content: f.content,
        sourceType: f.sourceType as "verified" | "decompiled",
      })),
    };

    // If no source files but contract has source code, return that
    if (response.files.length === 0 && contract.sourceCode) {
      response.files.push({
        path: contract.name ? `${contract.name}.sol` : "Contract.sol",
        content: contract.sourceCode,
        sourceType: contract.sourceType as "verified" | "decompiled",
      });
    }

    return res.json(response);
  } catch (error) {
    logger.error("Failed to get source code:", error);
    return res.status(500).json({ error: "Failed to get source code" });
  }
});

// ============================================
// GET /api/source/:analysisId/:address/abi - Get ABI for a contract
// ============================================

router.get("/:analysisId/:address/abi", async (req, res) => {
  try {
    const { analysisId, address } = req.params;
    const normalizedAddress = address.toLowerCase();

    const contract = await prisma.contract.findFirst({
      where: {
        analysisId,
        address: normalizedAddress,
      },
      select: {
        address: true,
        name: true,
        abiJson: true,
      },
    });

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    return res.json({
      address: contract.address,
      name: contract.name,
      abi: contract.abiJson || [],
    });
  } catch (error) {
    logger.error("Failed to get ABI:", error);
    return res.status(500).json({ error: "Failed to get ABI" });
  }
});

// ============================================
// GET /api/source/:analysisId/:address/types - Get type definitions
// ============================================

router.get("/:analysisId/:address/types", async (req, res) => {
  try {
    const { analysisId, address } = req.params;
    const normalizedAddress = address.toLowerCase();

    // Get source files for this contract
    const sourceFiles = await prisma.sourceFile.findMany({
      where: {
        analysisId,
        contractAddress: normalizedAddress,
      },
      include: {
        typeDefs: true,
      },
    });

    const types = sourceFiles.flatMap((sf) =>
      sf.typeDefs.map((td) => ({
        id: td.id,
        name: td.name,
        kind: td.kind,
        instanciable: td.instanciable,
        isRootContractType: td.isRootContractType,
        sourceFile: sf.path,
        metadata: td.metadataJson,
      }))
    );

    return res.json({ types });
  } catch (error) {
    logger.error("Failed to get types:", error);
    return res.status(500).json({ error: "Failed to get types" });
  }
});

// ============================================
// GET /api/source/:analysisId/:address/type/:typeName - Get extracted type definition
// ============================================

router.get("/:analysisId/:address/type/:typeName", async (req, res) => {
  try {
    const { analysisId, address, typeName } = req.params;
    const normalizedAddress = address.toLowerCase();

    // Get type definition from database
    const sourceFiles = await prisma.sourceFile.findMany({
      where: {
        analysisId,
        contractAddress: normalizedAddress,
      },
      include: {
        typeDefs: {
          where: {
            name: typeName,
          },
        },
      },
    });

    // Find the source file that contains this type
    const sourceFile = sourceFiles.find((sf) => sf.typeDefs.length > 0);

    if (!sourceFile || sourceFile.typeDefs.length === 0) {
      return res.status(404).json({ error: "Type definition not found" });
    }

    const typeDef = sourceFile.typeDefs[0];

    // Extract the type definition from the source code
    const extractedCode = extractTypeDefinition(
      sourceFile.content,
      typeName,
      typeDef.kind as "INTERFACE" | "LIBRARY" | "ABSTRACT_CONTRACT" | "CONTRACT_IMPL"
    );

    if (!extractedCode) {
      // Fallback to returning the whole file if extraction fails
      return res.json({
        typeName,
        kind: typeDef.kind,
        sourceFile: sourceFile.path,
        sourceType: sourceFile.sourceType,
        code: sourceFile.content,
        extracted: false,
      });
    }

    return res.json({
      typeName,
      kind: typeDef.kind,
      sourceFile: sourceFile.path,
      sourceType: sourceFile.sourceType,
      code: extractedCode,
      extracted: true,
    });
  } catch (error) {
    logger.error("Failed to get type definition:", error);
    return res.status(500).json({ error: "Failed to get type definition" });
  }
});

/**
 * Extract a specific type definition (contract, interface, library, abstract contract)
 * from Solidity source code.
 */
function extractTypeDefinition(
  sourceCode: string,
  typeName: string,
  kind: "INTERFACE" | "LIBRARY" | "ABSTRACT_CONTRACT" | "CONTRACT_IMPL"
): string | null {
  // Build regex pattern based on type kind
  let pattern: RegExp;

  switch (kind) {
    case "INTERFACE":
      pattern = new RegExp(`(interface\\s+${escapeRegex(typeName)}(?:\\s+is\\s+[^{]+)?\\s*\\{)`, "g");
      break;
    case "LIBRARY":
      pattern = new RegExp(`(library\\s+${escapeRegex(typeName)}\\s*\\{)`, "g");
      break;
    case "ABSTRACT_CONTRACT":
      pattern = new RegExp(`(abstract\\s+contract\\s+${escapeRegex(typeName)}(?:\\s+is\\s+[^{]+)?\\s*\\{)`, "g");
      break;
    case "CONTRACT_IMPL":
      // Match "contract X" but not "abstract contract X"
      pattern = new RegExp(`((?<!abstract\\s)contract\\s+${escapeRegex(typeName)}(?:\\s+is\\s+[^{]+)?\\s*\\{)`, "g");
      break;
    default:
      return null;
  }

  const match = pattern.exec(sourceCode);
  if (!match) {
    return null;
  }

  const startIndex = match.index;

  // Find the matching closing brace by counting braces
  let braceCount = 0;
  let endIndex = startIndex;
  let foundFirstBrace = false;

  for (let i = startIndex; i < sourceCode.length; i++) {
    const char = sourceCode[i];

    if (char === "{") {
      braceCount++;
      foundFirstBrace = true;
    } else if (char === "}") {
      braceCount--;

      if (foundFirstBrace && braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }

  if (endIndex <= startIndex) {
    return null;
  }

  // Extract the type definition
  let extracted = sourceCode.slice(startIndex, endIndex);

  // Also try to capture any preceding comments/NatSpec
  const precedingCode = sourceCode.slice(0, startIndex);
  const commentMatch = precedingCode.match(/((?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*?)$/);

  if (commentMatch && commentMatch[1]) {
    // Check if the preceding content has NatSpec or regular comments
    const precedingContent = commentMatch[1].trim();
    if (precedingContent.includes("///") || precedingContent.includes("/**") || precedingContent.includes("//")) {
      // Find where the comments start
      const lines = precedingCode.split("\n");
      let commentStartLine = lines.length - 1;

      // Walk backwards to find where comments/whitespace starts
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line === "" || line.startsWith("//") || line.startsWith("*") || line.startsWith("/**") || line.startsWith("*/")) {
          commentStartLine = i;
        } else {
          break;
        }
      }

      const commentsStart = lines.slice(0, commentStartLine).join("\n").length + 1;
      const comments = precedingCode.slice(commentsStart).trimStart();

      if (comments) {
        extracted = comments + extracted;
      }
    }
  }

  return extracted.trim();
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default router;

