import type {
  Event as GraphEvent,
  SingleValueLegacyExtendedProperty,
} from "@microsoft/microsoft-graph-types";

const keeperPropertySet = "{keeper-sh-0000-0000-000000000001}";

const namedProperty = (name: string): string => `String ${keeperPropertySet} Name ${name}`;

const mirroredUidPropertyName = namedProperty("uid");
const recurrencePropertyName = namedProperty("recurrence");

const extendedPropertyValue = (event: GraphEvent, id: string): string | null => {
  const held = event.singleValueExtendedProperties;
  if (!Array.isArray(held)) {
    return null;
  }
  const found = held.find((property) => property?.id === id);
  if (!found || typeof found.value !== "string") {
    return null;
  }
  return found.value;
};

const singleValueProperty = (id: string, value: string): SingleValueLegacyExtendedProperty => ({
  id,
  value,
});

export {
  extendedPropertyValue,
  keeperPropertySet,
  mirroredUidPropertyName,
  namedProperty,
  recurrencePropertyName,
  singleValueProperty,
};
