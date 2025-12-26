import { z } from "zod";
import { nanoid } from "@/lib/utils";
import { useEffect, useState, memo } from "react";
import { Button } from "@/components/ui/button";
import PropertyRow from "@/components/property-row";

interface Property {
  id: string;
  parentId?: string;
  name: string;
  description: string;
  type: string;
  isArray: boolean;
  isRequired: boolean;
  nestedProperties: Property[];
}

const buildZodShapeRecursive = (
  props: Property[],
  currentDepth: number,
  maxObjectDepth: number
): z.ZodRawShape => {
  const shape: z.ZodRawShape = {};
  props.forEach(prop => {
    const trimmedName = prop.name.trim();
    if (!trimmedName) return;

    let zodType: z.ZodTypeAny;

    switch (prop.type) {
      case "string":
        zodType = z.string();
        break;
      case "number":
        zodType = z.number();
        break;
      case "boolean":
        zodType = z.boolean();
        break;
      case "object":
        if (currentDepth >= maxObjectDepth) {
          zodType = z.object({});
        } else {
          const nestedShape = buildZodShapeRecursive(
            prop.nestedProperties,
            currentDepth + 1,
            maxObjectDepth
          );
          zodType = z.object(nestedShape);
        }
        break;
      default:
        zodType = z.any();
    }

    if (prop.isArray) {
      zodType = z.array(zodType);
    }

    if (!prop.isRequired) {
      zodType = zodType.optional();
    }

    shape[trimmedName] = zodType;
  });
  return shape;
};

const getPropertiesFromSchema = (schema: any): Property[] => {
  if (!schema || typeof schema !== 'object' || !schema.properties) {
    return [];
  }

  const properties = schema.properties;
  const required = new Set(schema.required || []);

  return Object.keys(properties).map((key): Property => {
    const propSchema = properties[key];

    const isArray = propSchema.type === 'array';
    const typeSchema = isArray ? propSchema.items || {} : propSchema;

    const type = typeSchema.type || 'any';
    let nestedProperties: Property[] = [];

    if (type === 'object' && typeSchema.properties) {
      const nestedRequired = new Set(typeSchema.required || []);
      nestedProperties = Object.keys(typeSchema.properties).map((nestedKey): Property => {
        const nestedPropSchema = typeSchema.properties[nestedKey];
        const nestedIsArray = nestedPropSchema.type === 'array';
        const nestedTypeSchema = nestedIsArray ? nestedPropSchema.items || {} : nestedPropSchema;

        return {
          id: nanoid(),
          name: nestedKey,
          description: nestedPropSchema.description || '',
          type: nestedTypeSchema.type || 'any',
          isArray: nestedIsArray,
          isRequired: nestedRequired.has(nestedKey),
          nestedProperties: [], 
        };
      });
    }

    return {
      id: nanoid(),
      name: key,
      description: propSchema.description || '',
      type,
      isArray,
      isRequired: required.has(key),
      nestedProperties,
    };
  });
};

const JsonSchemaInputComponent = ({ schema, setSchema }: { schema: object | null, setSchema: (schema: z.ZodObject<any> | null) => void }) => {
  const [confirmed, setConfirmed] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    if (schema) {
      const properties = getPropertiesFromSchema(schema);
      setProperties(properties);
      const shape = buildZodShapeRecursive(properties, 0, 1);
      const generatedSchema = z.object(shape);
      setSchema(generatedSchema);
      setConfirmed(true);
    }
  }, [schema]);

  const addProperty = () => {
    setProperties([...properties, { id: nanoid(), name: "", description: "", type: "string", isArray: false, isRequired: false, nestedProperties: [] }]);
    setConfirmed(false);
  };

  const addNestedProperty = (parentId: string) => {
    setProperties(properties.map(prop => prop.id === parentId ? { ...prop, nestedProperties: [...prop.nestedProperties, { id: nanoid(), name: "", description: "", type: "string", isArray: false, isRequired: false, nestedProperties: [] }] } : prop));
    setConfirmed(false);
  };

  const deleteProperty = (id: string, parentId?: string) => {
    if (parentId) {
      setProperties(properties.map(prop => prop.id === parentId ? { ...prop, nestedProperties: prop.nestedProperties.filter(nestedProp => nestedProp.id !== id) } : prop));
    } else {
      setProperties(properties.filter(prop => prop.id !== id));
    }
    setConfirmed(false);
  };

  const handlePropertyNameChange = (id: string, name: string, parentId?: string) => {
    if (parentId) {
      setProperties(properties.map(prop => prop.id === parentId ? { ...prop, nestedProperties: prop.nestedProperties.map(nestedProp => nestedProp.id === id ? { ...nestedProp, name } : nestedProp) } : prop));
    } else {
      setProperties(properties.map(prop => prop.id === id ? { ...prop, name } : prop));
    }
    setConfirmed(false);
  };

  const handlePropertyDescriptionChange = (id: string, description: string, parentId?: string) => {
    if (parentId) {
      setProperties(properties.map(prop => prop.id === parentId ? { ...prop, nestedProperties: prop.nestedProperties.map(nestedProp => nestedProp.id === id ? { ...nestedProp, description } : nestedProp) } : prop));
    } else {
      setProperties(properties.map(prop => prop.id === id ? { ...prop, description } : prop));
    }
    setConfirmed(false);
  };

  const handlePropertyTypeChange = (id: string, type: string, parentId?: string) => {
    if (parentId) {
      setProperties(properties.map(prop => prop.id === parentId ? { ...prop, nestedProperties: prop.nestedProperties.map(nestedProp => nestedProp.id === id ? { ...nestedProp, type } : nestedProp) } : prop));
    } else {
      setProperties(properties.map(prop => prop.id === id ? { ...prop, type } : prop));
    }
    setConfirmed(false);
  };

  const handleIsArrayChange = (id: string, isArray: boolean, parentId?: string) => {
    if (parentId) {
      setProperties(properties.map(prop => prop.id === parentId ? { ...prop, nestedProperties: prop.nestedProperties.map(nestedProp => nestedProp.id === id ? { ...nestedProp, isArray } : nestedProp) } : prop));
    } else {
      setProperties(properties.map(prop => prop.id === id ? { ...prop, isArray } : prop));
    }
    setConfirmed(false);
  };

  const handleIsRequiredChange = (id: string, isRequired: boolean, parentId?: string) => {
    if (parentId) {
      setProperties(properties.map(prop => prop.id === parentId ? { ...prop, nestedProperties: prop.nestedProperties.map(nestedProp => nestedProp.id === id ? { ...nestedProp, isRequired } : nestedProp) } : prop));
    } else {
      setProperties(properties.map(prop => prop.id === id ? { ...prop, isRequired } : prop));
    }
    setConfirmed(false);
  };

  const handleConfirm = () => {
    if (properties.length === 0) {
      setSchema(z.object({}));
    } else {
      const shape = buildZodShapeRecursive(properties, 0, 1);
      const generatedSchema = z.object(shape);
      setSchema(generatedSchema);
    }
    setConfirmed(true);
  };

  return (
    <div className="p-4 rounded-lg">
      {properties.length > 0 && <h2 className="text-lg font-semibold mb-4">Property</h2>}
      {properties.map(prop => (
        <div key={prop.id}>
          <PropertyRow 
            key={prop.id} 
            id={prop.id}
            propertyName={prop.name}
            propertyDescription={prop.description}
            propertyType={prop.type}
            isArray={prop.isArray}
            isRequired={prop.isRequired}
            onPropertyNameChange={handlePropertyNameChange}
            onPropertyDescriptionChange={handlePropertyDescriptionChange}
            onPropertyTypeChange={handlePropertyTypeChange}
            onIsArrayChange={handleIsArrayChange}
            onIsRequiredChange={handleIsRequiredChange}
            onDelete={() => deleteProperty(prop.id, undefined)} 
          />
          <div className="pl-10">
            {prop.nestedProperties.map(nestedProp => (
              <PropertyRow 
                key={nestedProp.id} 
                id={nestedProp.id}
                parentId={prop.id}
                propertyName={nestedProp.name}
                propertyDescription={nestedProp.description}
                propertyType={nestedProp.type}
                isArray={nestedProp.isArray}
                isRequired={nestedProp.isRequired}
                onPropertyNameChange={handlePropertyNameChange}
                onPropertyDescriptionChange={handlePropertyDescriptionChange}
                onPropertyTypeChange={handlePropertyTypeChange}
                onIsArrayChange={handleIsArrayChange}
                onIsRequiredChange={handleIsRequiredChange}
                onDelete={() => deleteProperty(nestedProp.id, prop.id)}
              />
            ))}
            {prop.type === "object" && <Button
                type="button"
                variant="outline"
                onClick={() => addNestedProperty(prop.id)}
              >
                Add nested property
              </Button>
            }
          </div>
        </div>
      ))}
      <div className="mt-2 flex flex-col items-start space-y-2">
        <Button
          type="button"
          variant="outline"
          onClick={addProperty}
        >
          Add property
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleConfirm}
          className="mt-2 self-end"
          disabled={confirmed}
        >
          Apply Changes
        </Button>
      </div>
    </div>
  );
}

export default memo(JsonSchemaInputComponent);
