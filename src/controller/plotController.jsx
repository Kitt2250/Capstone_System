import {
    createPlot,
    createBulkPlots,
    updatePlot,
    deletePlot,
    getPlots,
    getPlotById,
    getNextPlotNumber,
    subscribePlots,
    updatePlotOccupancy,
    upadatePlotOccupancy,
    deleteBurialAndUpdatePlot,
    syncAllPlotsOccupancy
} from "../services/plotServices";
import { logAuditEvent } from "../utils/auditLogger";

// ── Prefix mapping helper ──
const GRAVE_TYPE_PREFIX = {
    'single niche': 'SN',
    'singleniche': 'SN',
    'apartment': 'AP',
    'mausoleum': 'MA',
    'columbarium': 'CO',
    'bonevault': 'BV',
    'bone vault': 'BV',
    'garden type': 'GT',
    'gardentype': 'GT',
    'garden': 'GT',
    'ground grave': 'GG',
    'groundgrave': 'GG',
    'heroes buried': 'HB',
    'heroesburied': 'HB',
    'heroes': 'HB',
    'lawn lot': 'LL',
    'lawnlot': 'LL',
    'family estate': 'FE',
    'familyestate': 'FE'
};

export function getPlotCodePrefix(graveTypeId = '') {
    const raw = String(graveTypeId || '').trim();
    const key = raw.toLowerCase().replace(/[^a-z]/g, '');

    for (const [typeKey, prefix] of Object.entries(GRAVE_TYPE_PREFIX)) {
        if (key === typeKey.replace(/[^a-z]/g, '')) return prefix;
    }

    const words = raw.split(/[\s-_]+/).filter(Boolean);
    if (words.length >= 2) {
        const acronym = words.map((w) => w[0]).join('').toUpperCase().substring(0, 3);
        if (acronym.length >= 2) return acronym;
    }

    return raw.replace(/[^A-Za-z]/g, '').substring(0, 2).toUpperCase() || 'PL';
}

export function formatSectionCode(section = '') {
    let clean = String(section || '').trim();
    clean = clean.replace(/^(section|sec)[\s-_:]*/i, '').trim();
    if (!clean) clean = String(section || '').trim();
    clean = clean.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return clean || 'A';
}

// ── Create Plot Controller ──
export const createPlotController = async (plotData) => {
    if (!plotData.section?.trim()) {
        throw new Error("Section is required.");
    }
    const resolvedTypeId = plotData.grave_type_id || plotData.graveLotTypeID;
    if (!resolvedTypeId?.trim()) {
        throw new Error("Grave type ID is required.");
    }

    const typePrefix = getPlotCodePrefix(resolvedTypeId);
    const sectionCode = formatSectionCode(plotData.section);
    const fullPrefix = `${typePrefix}-${sectionCode}`;

    let plotCode = plotData.plotCode;
    if (!plotCode) {
        const nextNum = await getNextPlotNumber(fullPrefix);
        plotCode = `${fullPrefix}-${String(nextNum).padStart(3, '0')}`;
    }

    const payload = {
        ...plotData,
        plotCode,
        grave_type_id: resolvedTypeId.trim(),
        section: plotData.section.trim()
    };
    delete payload.graveLotTypeID;

    const createdId = await createPlot(payload);

    await logAuditEvent({
        module: 'Map Management',
        actionType: 'Create Plot',
        description: `Admin created plot ${payload.plotCode || createdId} in Section "${payload.section}"`,
        targetItem: `${payload.plotCode || createdId} (${payload.section})`,
        details: {
            plotId: createdId,
            ...payload
        }
    });

    return createdId;
};

// ── Bulk Create Plots Controller ──
export const createBulkPlotsController = async ({ plots, grave_type_id, graveLotTypeID, section }) => {
    if (!plots || plots.length === 0) {
        throw new Error("No plots to create.");
    }
    const resolvedTypeId = grave_type_id || graveLotTypeID;
    if (!resolvedTypeId) {
        throw new Error("Grave type ID is required.");
    }
    if (!section?.trim()) {
        throw new Error("Section is required.");
    }

    const typePrefix = getPlotCodePrefix(resolvedTypeId);
    const sectionCode = formatSectionCode(section);
    const fullPrefix = `${typePrefix}-${sectionCode}`;
    let nextNum = await getNextPlotNumber(fullPrefix);

    const normalizedPlots = plots.map((p) => {
        const { graveLotTypeID: _, ...rest } = p;
        const code = p.plotCode || `${fullPrefix}-${String(nextNum++).padStart(3, '0')}`;
        return {
            ...rest,
            plotCode: code,
            grave_type_id: p.grave_type_id || resolvedTypeId,
            section: section.trim()
        };
    });

    const { saved, errors } = await createBulkPlots(normalizedPlots);

    if (saved.length > 0) {
        const firstCode = saved[0]?.plotCode;
        const lastCode = saved[saved.length - 1]?.plotCode;
        const rangeStr = firstCode && lastCode ? `${firstCode} to ${lastCode}` : `${saved.length} plots`;

        await logAuditEvent({
            module: 'Map Management',
            actionType: 'Create Plot',
            description: `Admin created ${saved.length} new plot(s) (${rangeStr}) in Section "${section.trim()}"`,
            targetItem: `${saved.length} Plots (${section.trim()})`,
            details: {
                count: saved.length,
                section: section.trim(),
                grave_type_id: resolvedTypeId,
                range: rangeStr
            }
        });
    }

    return { saved, errors };
};


// ── Update Plot Controller ──
export const updatePlotController = async (plotId, updatedData) => {
    if (!plotId) {
        throw new Error("Plot ID is required.");
    }

    await updatePlot(plotId, updatedData);

    await logAuditEvent({
        module: 'Map Management',
        actionType: 'Update Plot',
        description: `Admin updated plot ${updatedData.plotCode || plotId}`,
        targetItem: updatedData.plotCode || plotId,
        details: {
            plotId,
            ...updatedData
        }
    });

    return { success: true, message: "Plot updated successfully." };
};

// ── Delete Plot Controller ──
export const deletePlotController = async (plotId, plotData = {}) => {
    if (!plotId) {
        throw new Error("Plot ID is required.");
    }

    const status = (plotData.status || '').toLowerCase().trim();
    const isOccupied = status === 'occupied' || Number(plotData.occupiedCount || 0) > 0 || Boolean(plotData.occupiedBy);

    if (isOccupied) {
        const title = plotData.plotCode || plotData.plotNumber || plotId;
        throw new Error(`Cannot delete plot ${title} because it is currently marked as Occupied.`);
    }

    await deletePlot(plotId);

    const plotTitle = plotData.plotCode || plotData.plotNumber || plotId;
    const plotSection = plotData.section || 'N/A';
    const plotType = plotData.grave_type_id || plotData.grave_type || plotData.graveLotTypeID || plotData.graveType || 'Grave Lot';

    await logAuditEvent({
        module: 'Map Management',
        actionType: 'Delete Plot',
        description: `Admin deleted plot ${plotTitle} (${plotType}, Section: ${plotSection})`,
        targetItem: `${plotTitle} (${plotSection})`,
        details: {
            plotId,
            plotCode: plotTitle,
            section: plotSection,
            graveType: plotType
        }
    });

    return { success: true, message: "Plot deleted successfully." };
};

// ── Update Plot Occupancy Controller ──
export const updatePlotOccupancyController = async (plotId, options = {}) => {
    if (!plotId) {
        throw new Error("Plot ID is required.");
    }
    const result = await updatePlotOccupancy(plotId, options);
    return { success: true, ...result };
};

// ── Delete Burial And Update Plot Controller ──
export const deleteBurialAndUpdatePlotController = async (burialId, plotId = null) => {
    if (!burialId) {
        throw new Error("Burial ID is required.");
    }
    const result = await deleteBurialAndUpdatePlot(burialId, plotId);

    if (result.plotId) {
        await logAuditEvent({
            module: 'Burial Management',
            actionType: 'Delete Burial',
            description: `Deleted burial ${burialId} and recalculated plot occupancy`,
            targetItem: result.plotId,
            details: { burialId, plotId: result.plotId }
        });
    }

    return { success: true, ...result };
};

export {
    getPlots,
    getPlotById,
    getNextPlotNumber,
    subscribePlots,
    updatePlotOccupancy,
    upadatePlotOccupancy,
    deleteBurialAndUpdatePlot,
    syncAllPlotsOccupancy
};

