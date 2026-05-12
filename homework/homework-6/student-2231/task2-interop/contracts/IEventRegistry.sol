// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IEventRegistry
 * @notice 接口：EVM 侧的活动登记中心
 *
 * 这个接口存在的目的是让 PVM 侧的 TicketMinter 能够 **反向回调** EVM
 * 侧的 EventRegistry —— 体现双向跨 VM 调用。
 *
 * 典型流程:
 *   1. 用户 -> EventRegistry.bookTicket(eventId)   (EVM)
 *   2. EventRegistry -> TicketMinter.mintTicket(...) (EVM -> PVM)
 *   3. TicketMinter -> EventRegistry.onTicketMinted(...) (PVM -> EVM, 回调)
 */
interface IEventRegistry {
    /// @notice PVM 合约铸造完票后回调 EVM 合约，让 EVM 扣减库存
    function onTicketMinted(uint256 eventId, uint256 ticketId, address buyer) external;
}
