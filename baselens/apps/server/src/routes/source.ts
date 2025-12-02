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

export default router;

