import { effectsRegistry } from "../registry";
import { blurEffectDefinition } from "./blur";
import { colorAdjustEffects } from "./color-adjust";
import { colorLookEffects } from "./color-looks";
import { overlayEffects } from "./overlays";

const defaultEffects = [
	blurEffectDefinition,
	...colorAdjustEffects,
	...colorLookEffects,
	...overlayEffects,
];

export function registerDefaultEffects(): void {
	for (const definition of defaultEffects) {
		if (effectsRegistry.has(definition.type)) {
			continue;
		}
		effectsRegistry.register({
			key: definition.type,
			definition,
		});
	}
}

export { colorAdjustEffects, colorLookEffects, overlayEffects };
