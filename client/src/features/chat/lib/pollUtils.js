// Groups votes per option and finds the current user's picks
export function aggregatePollVotes(poll, currentUserId) {
  const { options = [], votes = [] } = poll;

  const votersByOption = new Map(options.map((opt) => [opt.id, []]));
  const mySelectedOptionIds = new Set();
  const uniqueVoterIds = new Set();

  votes.forEach((vote) => {
    const voter = vote.userId;
    const voterId = String(voter?._id || voter?.id || voter);
    const selectedIds = vote.selectedOptionIds || [];
    const isMe = voterId === String(currentUserId);

    if (selectedIds.length > 0) uniqueVoterIds.add(voterId);

    selectedIds.forEach((optionId) => {
      if (isMe) mySelectedOptionIds.add(optionId);

      votersByOption.get(optionId)?.push({
        id: voterId,
        name: voter?.name || "Someone",
        avatarUrl: voter?.avatarUrl || voter?.avatar || null,
        updatedAt: vote.updatedAt,
        isMe,
      });
    });
  });

  return {
    votersByOption,
    mySelectedOptionIds,
    totalVoters: uniqueVoterIds.size,
  };
}

// Share of voters who picked an option, as a whole percent
export function votePercentage(voteCount, totalVoters) {
  return totalVoters > 0 ? Math.round((voteCount / totalVoters) * 100) : 0;
}
