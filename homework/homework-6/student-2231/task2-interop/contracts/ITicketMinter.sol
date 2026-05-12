// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ITicketMinter
 * @notice 接口：PVM 侧的票务铸造器
 *
 * 这个接口让 EVM 侧的 EventRegistry 能够调用 PVM 侧的 TicketMinter。
 * 因为 Polkadot Hub 的 pallet_revive 把 EVM / PVM 放在同一个地址空间，
 * 所以从 Solidity 角度看，这就是一次普通的外部调用，只不过目标地址
 * 在运行时会被路由到 PolkaVM 而不是 REVM 去执行。
 */
interface ITicketMinter {
    /// @notice 为某个活动某个用户铸造一张票
    /// @return ticketId 全局递增的票号
    function mintTicket(uint256 eventId, address owner) external returns (uint256 ticketId);

    /// @notice 查询某张票的 owner
    function ownerOfTicket(uint256 ticketId) external view returns (address);

    /// @notice 查询某张票属于哪个 event
    function eventOfTicket(uint256 ticketId) external view returns (uint256);

    /// @notice 查询一共铸造了多少张票
    function totalMinted() external view returns (uint256);
}
