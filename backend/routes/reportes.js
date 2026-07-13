const express = require('express');
const { requireGerente } = require('../auth');
const { generarReporte } = require('../reports');

const router = express.Router();

// ─── Reportes (solo gerente) — Excel o PDF ─────────────────────────────────────

router.get('/:tipo', requireGerente, (req, res) => generarReporte(req, res, req.params.tipo));

module.exports = router;
