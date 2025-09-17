export function eagerComponentsForInfo(info: any, mapping: Record<string, any[]>) {
    // Uses bunsane/gql.isFieldRequestedSafe under the hood in resolvers;
    // mapping: { selectionName: [ComponentA, ComponentB] } or { 'relation.field': [ComponentA] }
    const comps: any[] = [];
    for (const sel in mapping) {
        // info can be passed through to isFieldRequestedSafe in resolver
        // keep lightweight: check presence via provided helper if available
        try {
            // lazy import to avoid circular deps in some setups
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { isFieldRequestedSafe } = require("bunsane/gql/helpers");
            // Support nested paths like 'post.title' by splitting on '.'
            const path = sel.split('.');
            if (isFieldRequestedSafe(info, ...path)) {
                comps.push(...(mapping[sel] || []));
            }
        } catch {
            // fallback: if bunsane/gql isn't available, include everything
            comps.push(...(mapping[sel] || []));
        }
    }
    // remove duplicates
    return Array.from(new Set(comps));
}