import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import type { TemplateType } from 'shared';
import { TEMPLATES_DIR, toAbsolutePath, toRelativePath } from '../config.js';
import { prisma } from '../prismaClient.js';
import {
  generatePreviewTemplate,
  getDummyData,
  type PreviewSettings,
} from '../services/pdfGeneration.js';
import { validateTemplate } from '../services/templateValidation.js';

export const templatesRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const ALLOWED_EXTENSIONS: Record<TemplateType, string> = {
  ANSCHREIBEN: '.docx',
  QUITTUNG: '.pdf',
  RECHNUNG: '.docx',
};

const VALID_TYPES: TemplateType[] = ['ANSCHREIBEN', 'QUITTUNG', 'RECHNUNG'];

function isValidType(type: string): type is TemplateType {
  return VALID_TYPES.includes(type as TemplateType);
}

async function loadPreviewSettings(): Promise<PreviewSettings> {
  const rows = await prisma.systemSetting.findMany({
    where: {
      key: {
        in: [
          'treasurer',
          'charitablePurpose',
          'taxOfficeName',
          'taxNumber',
          'exemptionDate',
          'assessmentPeriod',
        ],
      },
    },
  });

  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    treasurer: values.get('treasurer') ?? '',
    charitablePurpose: values.get('charitablePurpose') ?? '',
    taxOfficeName: values.get('taxOfficeName') ?? '',
    taxNumber: values.get('taxNumber') ?? '',
    exemptionDate: values.get('exemptionDate') ?? '',
    assessmentPeriod: values.get('assessmentPeriod') ?? '',
  };
}

templatesRouter.get('/', async (_req, res) => {
  const templates = await prisma.template.findMany({
    where: { active: true },
    select: {
      id: true,
      type: true,
      version: true,
      fileName: true,
      active: true,
      uploadedAt: true,
    },
    orderBy: { type: 'asc' },
  });
  res.json(templates);
});

templatesRouter.get('/:type/download', async (req, res) => {
  const type = String(req.params.type).toUpperCase() as TemplateType;
  if (!isValidType(type)) {
    res.status(400).json({ error: 'Invalid template type' });
    return;
  }

  const template = await prisma.template.findFirst({
    where: { type, active: true },
  });
  if (!template) {
    res.status(404).json({ error: 'No active template found' });
    return;
  }

  res.download(toAbsolutePath(template.filePath), template.fileName);
});

templatesRouter.get('/preview/:type', async (req, res) => {
  const type = String(req.params.type).toUpperCase() as TemplateType;
  if (!isValidType(type)) {
    res.status(400).json({ error: 'Invalid template type' });
    return;
  }

  const template = await prisma.template.findFirst({
    where: { type, active: true },
  });
  if (!template) {
    res.status(404).json({ error: 'No active template available' });
    return;
  }

  try {
    const settings = await loadPreviewSettings();
    const data = getDummyData(type, settings);
    const templateBuffer = await fs.promises.readFile(toAbsolutePath(template.filePath));
    const previewBuffer = await generatePreviewTemplate(type, templateBuffer, data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${type.toLowerCase()}_preview.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(previewBuffer);
  } catch (error) {
    console.error(`[templates] Live preview generation failed for type=${type}`, error);
    res.status(500).json({ error: 'Preview could not be generated' });
  }
});

templatesRouter.post('/:type/preview', upload.single('template'), async (req, res) => {
  const type = String(req.params.type).toUpperCase() as TemplateType;
  if (!isValidType(type)) {
    res.status(400).json({ error: 'Invalid template type' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const allowedExtension = ALLOWED_EXTENSIONS[type];
  if (!req.file.originalname.toLowerCase().endsWith(allowedExtension)) {
    res.status(400).json({
      error: `Only ${allowedExtension} files allowed for template type ${type}`,
    });
    return;
  }

  const error = await validateTemplate(type, req.file.buffer);
  if (error) {
    res.status(422).json({
      error: 'Invalid template',
      missingRequiredFields: error.missingRequiredFields,
    });
    return;
  }

  const settings = await loadPreviewSettings();
  const data = getDummyData(type, settings);

  try {
    const previewBuffer = await generatePreviewTemplate(type, req.file.buffer, data);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: previewBuffer.toString('base64'),
      type,
    });
  } catch (error) {
    console.error(`[templates] Upload preview generation failed for type=${type}`, error);
    res.status(500).json({ error: 'Preview could not be generated' });
  }
});

templatesRouter.post('/:type/upload', upload.single('template'), async (req, res) => {
  const type = String(req.params.type).toUpperCase() as TemplateType;
  if (!isValidType(type)) {
    res.status(400).json({ error: 'Invalid template type' });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const allowedExtension = ALLOWED_EXTENSIONS[type];
  if (!req.file.originalname.toLowerCase().endsWith(allowedExtension)) {
    res.status(400).json({
      error: `Only ${allowedExtension} files allowed for template type ${type}`,
    });
    return;
  }

  const error = await validateTemplate(type, req.file.buffer);
  if (error) {
    res.status(422).json({
      error: `Template invalid: required fields missing`,
      missingRequiredFields: error.missingRequiredFields,
    });
    return;
  }

  const currentTemplate = await prisma.template.findFirst({
    where: { type, active: true },
  });
  const newVersion = currentTemplate ? currentTemplate.version + 1 : 1;

  const fileName = req.file.originalname;
  const filePath = path.join(TEMPLATES_DIR, `${type.toLowerCase()}_v${newVersion}_${fileName}`);

  await fs.promises.mkdir(TEMPLATES_DIR, { recursive: true });
  await fs.promises.writeFile(filePath, req.file.buffer);

  await prisma.$transaction([
    prisma.template.updateMany({
      where: { type, active: true },
      data: { active: false },
    }),
    prisma.template.create({
      data: {
        type,
        version: newVersion,
        fileName,
        filePath: toRelativePath(filePath),
        active: true,
      },
    }),
  ]);

  const newTemplate = await prisma.template.findFirst({
    where: { type, active: true },
  });

  res.status(201).json(newTemplate);
});
