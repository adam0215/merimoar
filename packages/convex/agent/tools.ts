import { createCaseTools } from "#/agent/toolDomains/cases";
import { createDiscoveryTools } from "#/agent/toolDomains/discovery";
import { createEmailTools } from "#/agent/toolDomains/email";

const caseTools = createCaseTools();
const discoveryTools = createDiscoveryTools();
const emailTools = createEmailTools();

export const search = discoveryTools.search;
export const inspectEntity = discoveryTools.inspectEntity;
export const inspectContact = discoveryTools.inspectContact;

export const readCase = caseTools.readCase;
export const createCase = caseTools.createCase;
export const updateCase = caseTools.updateCase;
export const addCaseRelation = caseTools.addCaseRelation;

export const searchEmails = emailTools.searchEmails;
export const readEmailThread = emailTools.readEmailThread;
export const sendEmail = emailTools.sendEmail;
