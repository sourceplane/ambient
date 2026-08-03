import type {
  Company,
  Credit,
  Episode,
  Image,
  Keyword,
  Person,
  Season,
  Title,
  TitleAka,
  TitleBoxOffice,
  TitleCertificate,
  TitleCompany,
  TitleConnection,
  TitleExternalId,
  TitleGenre,
  TitleKeyword,
  TitleLocation,
  TitleReleaseDate,
  TitleTechnicalSpec,
  Video,
} from "@saas/db/catalog";
import type {
  PublicBoxOffice,
  PublicCertificate,
  PublicCompany,
  PublicCreditBase,
  PublicEpisode,
  PublicExternalId,
  PublicFilmingLocation,
  PublicGenre,
  PublicImage,
  PublicKeyword,
  PublicName,
  PublicNameSummary,
  PublicReleaseDate,
  PublicSeason,
  PublicTechnicalSpec,
  PublicTitle,
  PublicTitleAka,
  PublicTitleCompany,
  PublicTitleConnection,
  PublicTitleSummary,
  PublicVideo,
} from "@saas/contracts/catalog";
import {
  companyPublicId,
  creditPublicId,
  imagePublicId,
  namePublicId,
  titlePublicId,
  videoPublicId,
} from "./ids.js";

export function toPublicImage(image: Image): PublicImage {
  return {
    id: imagePublicId(image.id),
    url: image.url,
    width: image.width,
    height: image.height,
    kind: image.kind,
    caption: image.caption,
    credit: image.credit,
    language: image.language,
    blurhash: image.blurhash,
    isPrimary: image.isPrimary,
  };
}

export function toPublicVideo(video: Video): PublicVideo {
  return {
    id: videoPublicId(video.id),
    titleId: video.titleId ? titlePublicId(video.titleId) : null,
    nameId: video.personId ? namePublicId(video.personId) : null,
    kind: video.kind,
    name: video.name,
    url: video.url,
    thumbnailUrl: video.thumbnailUrl,
    runtimeSeconds: video.runtimeSeconds,
    language: video.language,
    publishedAt: video.publishedAt ? video.publishedAt.toISOString() : null,
  };
}

export function toPublicGenre(genre: TitleGenre | { slug: string; name: string }): PublicGenre {
  return { slug: genre.slug, name: genre.name };
}

export function toPublicTitleSummary(
  title: Title,
  genres: PublicGenre[] = [],
  primaryImage: Image | null = null,
): PublicTitleSummary {
  return {
    id: titlePublicId(title.id),
    kind: title.kind,
    primaryTitle: title.primaryTitle,
    originalTitle: title.originalTitle,
    startYear: title.startYear,
    endYear: title.endYear,
    runtimeMinutes: title.runtimeMinutes,
    isAdult: title.isAdult,
    genres,
    primaryImage: primaryImage ? toPublicImage(primaryImage) : null,
  };
}

export function toPublicTitle(
  title: Title,
  genres: PublicGenre[] = [],
  primaryImage: Image | null = null,
): PublicTitle {
  return {
    ...toPublicTitleSummary(title, genres, primaryImage),
    sortTitle: title.sortTitle,
    productionStatus: title.productionStatus,
    plotOutline: title.plotOutline,
    plotSummary: title.plotSummary,
    synopsis: title.synopsis,
    tagline: title.tagline,
    createdAt: title.createdAt.toISOString(),
    updatedAt: title.updatedAt.toISOString(),
  };
}

export function toPublicNameSummary(
  person: Person,
  professions: string[] = [],
  primaryImage: Image | null = null,
): PublicNameSummary {
  return {
    id: namePublicId(person.id),
    name: person.name,
    primaryImage: primaryImage ? toPublicImage(primaryImage) : null,
    professions,
  };
}

export function toPublicName(
  person: Person,
  professions: string[] = [],
  primaryImage: Image | null = null,
): PublicName {
  return {
    ...toPublicNameSummary(person, professions, primaryImage),
    birthDate: person.birthDate,
    birthPlace: person.birthPlace,
    deathDate: person.deathDate,
    deathPlace: person.deathPlace,
    deathCause: person.deathCause,
    heightCm: person.heightCm,
    miniBio: person.miniBio,
    bioAuthor: person.bioAuthor,
    createdAt: person.createdAt.toISOString(),
    updatedAt: person.updatedAt.toISOString(),
  };
}

export function toPublicCreditBase(credit: Credit): PublicCreditBase {
  return {
    id: creditPublicId(credit.id),
    category: credit.category,
    department: credit.department,
    job: credit.job,
    characters: credit.characters,
    billingOrder: credit.billingOrder,
    episodeCount: credit.episodeCount,
    isUncredited: credit.isUncredited,
    isVoice: credit.isVoice,
    isArchiveFootage: credit.isArchiveFootage,
    isSelf: credit.isSelf,
    note: credit.note,
  };
}

export function toPublicAka(aka: TitleAka): PublicTitleAka {
  return {
    ordering: aka.ordering,
    title: aka.title,
    region: aka.region,
    language: aka.language,
    types: aka.types,
    attributes: aka.attributes,
    isOriginalTitle: aka.isOriginalTitle,
  };
}

export function toPublicReleaseDate(release: TitleReleaseDate): PublicReleaseDate {
  return {
    country: release.country,
    releasedOn: release.releasedOn,
    kind: release.kind,
    note: release.note,
  };
}

export function toPublicCertificate(certificate: TitleCertificate): PublicCertificate {
  return {
    country: certificate.country,
    rating: certificate.rating,
    attributes: certificate.attributes,
  };
}

export function toPublicLocation(location: TitleLocation): PublicFilmingLocation {
  return { location: location.location, note: location.note };
}

export function toPublicBoxOffice(boxOffice: TitleBoxOffice): PublicBoxOffice {
  return {
    budgetCents: boxOffice.budgetCents,
    openingWeekendCents: boxOffice.openingWeekendCents,
    openingWeekendCountry: boxOffice.openingWeekendCountry,
    openingWeekendOn: boxOffice.openingWeekendOn,
    grossDomesticCents: boxOffice.grossDomesticCents,
    grossWorldwideCents: boxOffice.grossWorldwideCents,
    currency: boxOffice.currency,
  };
}

export function toPublicTechnicalSpec(spec: TitleTechnicalSpec): PublicTechnicalSpec {
  return { spec: spec.spec, value: spec.value, note: spec.note };
}

export function toPublicExternalId(externalId: TitleExternalId): PublicExternalId {
  return { provider: externalId.provider, value: externalId.value, label: externalId.label };
}

export function toPublicConnection(connection: TitleConnection): PublicTitleConnection | null {
  // A connection whose far side is unpublished is not a connection the public
  // surface can render — drop it rather than emit a dangling reference.
  if (!connection.title) return null;
  return {
    kind: connection.kind,
    note: connection.note,
    title: toPublicTitleSummary(connection.title),
  };
}

export function toPublicKeyword(keyword: TitleKeyword): PublicKeyword {
  return {
    slug: keyword.slug,
    name: keyword.name,
    relevantVotes: keyword.relevantVotes,
    totalVotes: keyword.totalVotes,
  };
}

export function toPublicCompany(company: Company): PublicCompany {
  return {
    id: companyPublicId(company.id),
    name: company.name,
    country: company.country,
    foundedYear: company.foundedYear,
    kind: company.kind,
  };
}

export function toPublicTitleCompany(link: TitleCompany): PublicTitleCompany | null {
  if (!link.company) return null;
  return {
    role: link.role,
    note: link.note,
    yearFrom: link.yearFrom,
    yearTo: link.yearTo,
    company: toPublicCompany(link.company),
  };
}

export function toPublicSeason(season: Season): PublicSeason {
  return {
    seasonNumber: season.seasonNumber,
    name: season.name,
    overview: season.overview,
    airDate: season.airDate,
    episodeCount: season.episodeCount,
  };
}

export function toPublicEpisode(episode: Episode): PublicEpisode | null {
  if (!episode.title) return null;
  return {
    seriesId: titlePublicId(episode.seriesTitleId),
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    airedOn: episode.airedOn,
    title: toPublicTitleSummary(episode.title),
  };
}

export function toPublicKeywordRecord(keyword: Keyword): {
  slug: string;
  name: string;
  titleCount: number;
} {
  return { slug: keyword.slug, name: keyword.name, titleCount: keyword.titleCount };
}
