import prisma from './prisma.js';

export interface GeneralFeeInput {
  fee_id: number;
  amount: number;
}

export interface OtherGeneralFeeInput {
  description: string;
  amount: number;
}

export class GeneralFeeValidationError extends Error {
  readonly feeIds: number[];

  constructor(feeIds: number[]) {
    super(`Invalid or inactive general fee ids: ${feeIds.join(', ')}`);
    this.name = 'GeneralFeeValidationError';
    this.feeIds = feeIds;
  }
}

function toGeneralFeeRecord(fee: { id: number; name: string }) {
  return { id: fee.id, name: fee.name };
}

export async function getAvailableGeneralFees() {
  const fees = await prisma.generalFee.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true }
  });

  return fees.map(toGeneralFeeRecord);
}

export async function validateGeneralFeeIds(fees: GeneralFeeInput[]): Promise<void> {
  const uniqueFeeIds = [...new Set(fees.map((fee) => fee.fee_id))];
  if (uniqueFeeIds.length === 0) return;

  const activeFees = await prisma.generalFee.findMany({
    where: { id: { in: uniqueFeeIds }, is_active: true },
    select: { id: true }
  });
  const validIds = new Set(activeFees.map((fee) => fee.id));
  const invalidIds = uniqueFeeIds.filter((feeId) => !validIds.has(feeId));

  if (invalidIds.length > 0) {
    throw new GeneralFeeValidationError(invalidIds);
  }
}

export async function replaceListingGeneralFees(
  listingId: number,
  fees: GeneralFeeInput[],
  otherFees: OtherGeneralFeeInput[]
): Promise<void> {
  const uniqueFees = [...new Map(fees.map((fee) => [fee.fee_id, fee])).values()];

  await prisma.$transaction(async (transaction) => {
    await transaction.listingGeneralFeeSelection.deleteMany({ where: { listing_id: listingId } });
    await transaction.listingOtherGeneralFee.deleteMany({ where: { listing_id: listingId } });

    if (uniqueFees.length > 0) {
      await transaction.listingGeneralFeeSelection.createMany({
        data: uniqueFees.map((fee) => ({ listing_id: listingId, fee_id: fee.fee_id, amount: fee.amount }))
      });
    }

    if (otherFees.length > 0) {
      await transaction.listingOtherGeneralFee.createMany({
        data: otherFees.map((fee) => ({ listing_id: listingId, description: fee.description, amount: fee.amount }))
      });
    }
  });
}

export async function getListingGeneralFees(listingId: number) {
  const [selectedFees, otherFees] = await Promise.all([
    prisma.listingGeneralFeeSelection.findMany({
      where: { listing_id: listingId, fee: { is_active: true } },
      orderBy: { fee: { name: 'asc' } },
      select: { fee_id: true, amount: true, fee: { select: { id: true, name: true } } }
    }),
    prisma.listingOtherGeneralFee.findMany({
      where: { listing_id: listingId },
      orderBy: { id: 'asc' },
      select: { description: true, amount: true }
    })
  ]);

  return {
    general_fees: selectedFees.map((selection) => ({
      fee_id: selection.fee_id,
      name: selection.fee.name,
      amount: Number(selection.amount)
    })),
    other_general_fees: otherFees.map((fee) => ({
      description: fee.description,
      amount: Number(fee.amount)
    }))
  };
}

export async function addListingGeneralFees<T extends Record<string, unknown>>(listing: T): Promise<T> {
  return { ...listing, ...(await getListingGeneralFees(Number(listing.id))) };
}