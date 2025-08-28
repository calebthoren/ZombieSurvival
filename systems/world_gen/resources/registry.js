const registry = new Map();

export function registerResourceType(id, generatorFn) {
    if (typeof id !== 'string' || typeof generatorFn !== 'function') {
        throw new Error('Invalid resource registration');
    }
    registry.set(id, generatorFn);
}

export function getResourceRegistry() {
    return registry;
}

export default { registerResourceType, getResourceRegistry };
