import prisma from './prisma.js';

export type ListingOptionType = 'AMENITY' | 'SECURITY_OPTION';

export interface ListingOptionRecord {
  id: number;
  name: string;
  type: ListingOptionType;
}

export class ListingOptionValidationError extends Error {
  readonly optionIds: number[];

  constructor(optionIds: number[]) {
    super(`Invalid or inactive listing option ids: ${optionIds.join(', ')}`);
    this.name = 'ListingOptionValidationError';
    this.optionIds = optionIds;
  }
}

function toOptionRecord(option: { id: number; name: string; type: ListingOptionType }): ListingOptionRecord {
  return {
    id: option.id,
    name: option.name,
    type: option.type
  };
}

export async function getAvailableListingOptions(): Promise<ListingOptionRecord[]> {
  const options = await prisma.listingOption.findMany({
    where: { is_active: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, type: true }
  });

  return options.map(toOptionRecord);
}

export async function validateListingOptionIds(optionIds: number[]): Promise<void> {
  const uniqueOptionIds = [...new Set(optionIds)];

  if (uniqueOptionIds.length === 0) {
    return;
  }

  const options = await prisma.listingOption.findMany({
    where: {
      id: { in: uniqueOptionIds },
      is_active: true
    },
    select: { id: true }
  });
  const validIds = new Set(options.map((option) => option.id));
  const invalidIds = uniqueOptionIds.filter((optionId) => !validIds.has(optionId));

  if (invalidIds.length > 0) {
    throw new ListingOptionValidationError(invalidIds);
  }
}

export async function replaceListingOptionSelections(listingId: number, optionIds: number[]): Promise<void> {
  const uniqueOptionIds = [...new Set(optionIds)];

  await prisma.$transaction(async (transaction) => {
    await transaction.listingOptionSelection.deleteMany({ where: { listing_id: listingId } });

    if (uniqueOptionIds.length > 0) {
      await transaction.listingOptionSelection.createMany({
        data: uniqueOptionIds.map((optionId) => ({ listing_id: listingId, option_id: optionId }))
      });
    }
  });
}

export async function getListingOptions(listingId: number): Promise<ListingOptionRecord[]> {
  const selections = await prisma.listingOptionSelection.findMany({
    where: { listing_id: listingId, option: { is_active: true } },
    orderBy: { option: { name: 'asc' } },
    select: {
      option: { select: { id: true, name: true, type: true } }
    }
  });

  return selections.map((selection) => toOptionRecord(selection.option));
}

export async function addListingOptions<T extends Record<string, unknown>>(listing: T): Promise<T & {
  option_ids: number[];
  options: ListingOptionRecord[];
}> {
  const options = await getListingOptions(Number(listing.id));

  return {
    ...listing,
    option_ids: options.map((option) => option.id),
    options
  };
}

export async function groupListingOptions(): Promise<{
  amenities: ListingOptionRecord[];
  security_options: ListingOptionRecord[];
}> {
  const options = await getAvailableListingOptions();

  return {
    amenities: options.filter((option) => option.type === 'AMENITY'),
    security_options: options.filter((option) => option.type === 'SECURITY_OPTION')
  };
}